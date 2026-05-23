
        let pantry = JSON.parse(localStorage.getItem('eco_pantry')) || [];
        let cachedRecipes = {};
        let totalMass = parseFloat(localStorage.getItem('eco_mass_v5')) || 0;

        const UI = {
            input: document.getElementById('item-input'),
            addBtn: document.getElementById('add-btn'),
            tags: document.getElementById('tags-container'),
            results: document.getElementById('results-area'),
            modal: document.getElementById('recipe-modal'),
            modalBody: document.getElementById('modal-render-target'),
            modalTitle: document.getElementById('modal-title'),
            massUI: document.getElementById('mass-ui'),
            co2UI: document.getElementById('co2-ui'),
            treesUI: document.getElementById('trees-ui'),
            searchBtn: document.getElementById('search-btn'),
            resetBtn: document.getElementById('reset-all-btn')
        };

        const commonIngredients = ["chicken","rice","tomato","onion","garlic","egg","potato","carrot","beef","salmon","beans","spinach","cheese","lemon","avocado","broccoli"];

        function renderSuggestions() {
            document.getElementById('suggestions').innerHTML = commonIngredients.map(ing => `
                <div class="pill" onclick="quickAdd('${ing}')">${ing}</div>
            `).join('');
        }

        function quickAdd(item) {
            if (!pantry.includes(item)) {
                pantry.push(item);
                savePantry();
                renderTags();
            }
        }

        function savePantry() {
            localStorage.setItem('eco_pantry', JSON.stringify(pantry));
        }

        function updateMetrics() {
            const wasteDiverted = totalMass.toFixed(1);
            const co2Saved = (totalMass * 2.85).toFixed(1);
            const trees = Math.round(totalMass * 0.85);

            UI.massUI.textContent = wasteDiverted;
            UI.co2UI.textContent = co2Saved;
            UI.treesUI.textContent = trees;
        }

        function renderTags() {
            UI.tags.innerHTML = pantry.map((item, i) => `
                <div class="tag">
                    ${item}
                    <span class="remove" onclick="removeItem(${i})">✕</span>
                </div>
            `).join('');
        }

        window.removeItem = function(idx) {
            pantry.splice(idx, 1);
            savePantry();
            renderTags();
        };

        function addItem() {
            const val = UI.input.value.trim().toLowerCase();
            if (val && !pantry.includes(val)) {
                pantry.push(val);
                savePantry();
                renderTags();
                UI.input.value = '';
            }
        }

        async function runAlgorithm() {
            if (pantry.length === 0) return;

            UI.results.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:5rem 0;">
                <div class="loader"></div>
                <p style="margin-top:1.5rem;color:#64748b;font-weight:500;">Analyzing global recipe database...</p>
            </div>`;

            try {
                const fetchers = pantry.map(ing => 
                    fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ing)}`)
                        .then(r => r.ok ? r.json() : null).catch(() => null)
                );

                const responses = await Promise.all(fetchers);
                const frequency = new Map();

                responses.forEach(resp => {
                    if (resp && resp.meals) {
                        resp.meals.forEach(meal => {
                            if (!frequency.has(meal.idMeal)) {
                                frequency.set(meal.idMeal, {meal, count: 1});
                            } else {
                                frequency.get(meal.idMeal).count++;
                            }
                        });
                    }
                });

                if (frequency.size === 0) {
                    UI.results.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Try adding more common ingredients.</p></div>`;
                    return;
                }

                const sorted = Array.from(frequency.values())
                    .map(entry => {
                        const matchRate = (entry.count / pantry.length) * 100;
                        let sustainabilityScore = matchRate;
                        const name = entry.meal.strMeal.toLowerCase();
                        if (name.includes('vegan') || name.includes('vegetarian') || 
                            name.includes('tofu') || name.includes('bean') || name.includes('lentil')) {
                            sustainabilityScore += 25;
                        }
                        if (entry.count >= 3) sustainabilityScore += 15;
                        return { ...entry, matchRate, sustainabilityScore };
                    })
                    .sort((a,b) => b.sustainabilityScore - a.sustainabilityScore)
                    .slice(0, 12);

                const detailPromises = sorted.map(entry => 
                    fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${entry.meal.idMeal}`)
                        .then(r => r.json())
                );

                const details = await Promise.all(detailPromises);

                let html = '';
                details.forEach((data, idx) => {
                    const meal = data.meals[0];
                    if (!meal) return;

                    cachedRecipes[meal.idMeal] = meal;
                    const matchRate = Math.round(sorted[idx].matchRate);

                    html += `
                        <div class="recipe-card" onclick="showRecipe('${meal.idMeal}')">
                            <div style="position:relative">
                                <img src="${meal.strMealThumb}" class="recipe-img" alt="${meal.strMeal}">
                                <div class="match-badge" style="background: ${matchRate === 100 ? '#10b981' : '#eab308'}; color:white;">
                                    <i class="fas fa-seedling"></i> ${matchRate}%
                                </div>
                            </div>
                            <div class="recipe-content">
                                <h3>${meal.strMeal}</h3>
                                <p style="color:#64748b;font-size:0.92rem;">${meal.strArea} • ${meal.strCategory}</p>
                            </div>
                        </div>
                    `;
                });

                UI.results.innerHTML = html;

                totalMass += pantry.length * 0.75;
                localStorage.setItem('eco_mass_v5', totalMass);
                updateMetrics();

            } catch(e) {
                UI.results.innerHTML = `<div class="empty-state"><h3>Connection issue</h3><p>Please try again later.</p></div>`;
            }
        }

        window.showRecipe = function(id) {
            const meal = cachedRecipes[id];
            if (!meal) return;

            let ingredientsHTML = '';
            for (let i = 1; i <= 20; i++) {
                const ing = meal[`strIngredient${i}`];
                const measure = meal[`strMeasure${i}`];
                if (ing && ing.trim()) {
                    ingredientsHTML += `<li><strong>${measure ? measure + ' ' : ''}</strong>${ing}</li>`;
                }
            }

            UI.modalTitle.textContent = meal.strMeal;

            UI.modalBody.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:2.5rem;">
                    <img src="${meal.strMealThumb}" style="width:100%;border-radius:22px;box-shadow:0 15px 30px -10px rgb(0 0 0 / 0.2);" alt="">
                    
                    <div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:1.5rem;">
                            <div style="background:#f0fdfa;padding:10px 20px;border-radius:9999px;font-size:1rem;">
                                <strong>Category:</strong> ${meal.strCategory}
                            </div>
                            <div style="background:#f0fdfa;padding:10px 20px;border-radius:9999px;font-size:1rem;">
                                <strong>Origin:</strong> ${meal.strArea}
                            </div>
                        </div>
                        
                        ${meal.strYoutube ? `
                        <a href="${meal.strYoutube}" target="_blank" style="display:flex;align-items:center;gap:10px;background:#ef4444;color:white;padding:14px 24px;border-radius:9999px;text-decoration:none;font-weight:700;">
                            <i class="fab fa-youtube"></i> Watch Video Tutorial
                        </a>` : ''}
                    </div>
                </div>

                <h3 style="margin:2rem 0 1rem;color:#0f172a;">📋 Ingredients</h3>
                <ul style="columns:2;column-gap:3rem;line-height:2.1;">${ingredientsHTML}</ul>

                <h3 style="margin:2.5rem 0 1rem;color:#0f172a;">👨‍🍳 Instructions</h3>
                <div style="background:#f8fafc;padding:2rem;border-radius:22px;white-space:pre-line;line-height:1.85;">
                    ${meal.strInstructions}
                </div>

                <div style="margin-top:2.5rem;padding:1.5rem;background:linear-gradient(135deg,#ecfdf5,#f0fdfa);border-radius:22px;">
                    <h4 style="color:#065f46;margin-bottom:0.75rem;">🌱 Sustainability Tip</h4>
                    <p style="color:#0f766e;">This recipe helps reduce food waste by utilizing ingredients you already have. Swap proteins with plant-based alternatives to further lower your carbon footprint.</p>
                </div>
            `;

            UI.modal.classList.add('active');
        };

        function hideModal() {
            UI.modal.classList.remove('active');
        }

        function resetAll() {
            if (confirm("Clear all data and reset impact counters?")) {
                pantry = [];
                cachedRecipes = {};
                totalMass = 0;
                localStorage.clear();
                renderTags();
                updateMetrics();
                UI.results.innerHTML = `
                    <div class="empty-state">
                        <div style="font-size:5rem;margin-bottom:1rem;">🌱</div>
                        <h3>Everything Reset</h3>
                        <p>Your pantry is fresh. Start adding ingredients!</p>
                    </div>`;
            }
        }

        UI.addBtn.addEventListener('click', addItem);
        UI.input.addEventListener('keypress', e => { if(e.key === "Enter") addItem(); });
        UI.searchBtn.addEventListener('click', runAlgorithm);
        UI.resetBtn.addEventListener('click', resetAll);
        UI.modal.addEventListener('click', e => { if(e.target === UI.modal) hideModal(); });
        document.getElementById('close-modal').addEventListener('click', hideModal);

        document.addEventListener('keydown', e => {
            if (e.key === "Escape") hideModal();
        });

      
        document.getElementById('year').textContent = new Date().getFullYear();

      
        renderSuggestions();
        renderTags();
        updateMetrics();