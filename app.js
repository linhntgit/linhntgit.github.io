document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const btnFull = document.getElementById('btn-full');
    const btnHalf = document.getElementById('btn-half');
    
    // Inputs
    const doseSelect = document.getElementById('dose-select');
    const inputVd = document.getElementById('input-vd');
    const inputThalf = document.getElementById('input-thalf');
    const inputVmax = document.getElementById('input-vmax');
    const inputKm = document.getElementById('input-km');
    const inputKtransit = document.getElementById('input-ktransit');
    const allInputs = [doseSelect, inputVd, inputThalf, inputVmax, inputKm, inputKtransit];

    // SVG Elements
    const fullGroup = document.getElementById('full-tablet-group');
    const halfLeft = document.getElementById('half-tablet-left');
    const halfRight = document.getElementById('half-tablet-right');
    
    // Stats Elements
    const saIndicator = document.getElementById('sa-indicator');
    const dissIndicator = document.getElementById('diss-indicator');
    const fValue = document.getElementById('f-value');
    const cmaxValue = document.getElementById('cmax-value');
    const tmaxValue = document.getElementById('tmax-value');
    const aucValue = document.getElementById('auc-value');

    // Chart instances
    let dissChart, pkChart;

    // Data arrays
    const time_diss = Array.from({length: 61}, (_, i) => i); // 0 to 60 mins
    const time_pk = Array.from({length: 49}, (_, i) => i * 0.5); // 0 to 24 hrs
    
    let diss_full_data = [], diss_broken_data = [];
    let pk_full_data = [], pk_broken_data = [];
    let stats_full = {}, stats_broken = {};

    // Helper to calculate analytical dissolution
    function calculateDissolution(t_min, kd_min) {
        return 100 * (1 - Math.exp(-kd_min * t_min));
    }

    // Numerical integration for Michaelis-Menten absorption (Euler Method)
    function simulatePK(dose, kd_hr, Vd, ke, Vmax, Km, k_transit) {
        let dt = 0.02; // fine time step in hours
        let steps = 24 / dt;
        let data = [];
        
        let A_solid = dose;
        let A_diss = 0;
        let A_plasma = 0;
        
        let total_absorbed = 0;
        let AUC = 0;
        
        // We need to sample every 0.5 hours for the chart (every 25 steps if dt=0.02)
        const sampleRate = Math.round(0.5 / dt);
        
        for (let i = 0; i <= steps; i++) {
            // Save point for chart
            if (i % sampleRate === 0) {
                data.push(A_plasma / Vd);
            }
            
            // Differential equations
            let d_solid = -kd_hr * A_solid;
            
            // Michaelis-Menten transporter velocity
            let v_abs = (Vmax * A_diss) / (Km + A_diss);
            
            let d_diss = kd_hr * A_solid - v_abs - k_transit * A_diss;
            let d_plasma = v_abs - ke * A_plasma;
            
            // Euler update
            A_solid += d_solid * dt;
            A_diss += d_diss * dt;
            if (A_diss < 0) A_diss = 0; // prevent negative from overshoot
            A_plasma += d_plasma * dt;
            
            // Accumulate stats
            total_absorbed += v_abs * dt;
            AUC += (A_plasma / Vd) * dt;
        }
        
        return {
            profile: data,
            auc: AUC,
            f: (total_absorbed / dose) * 100
        };
    }

    function recalculateData() {
        // Read Parameters
        const D = parseInt(doseSelect.value) || 500;
        const Vd = parseFloat(inputVd.value) || 150;
        const t_half = parseFloat(inputThalf.value) || 5.0;
        const Vmax = parseFloat(inputVmax.value) || 250;
        const Km = parseFloat(inputKm.value) || 100;
        const k_transit = parseFloat(inputKtransit.value) || 0.5;
        
        const ke = Math.LN2 / t_half;
        
        // Dissolution rates
        const kd_full_hr = 0.8;
        const kd_full_min = kd_full_hr / 60; // ~0.013 min^-1
        
        const sa_ratio = 1.32;
        const kd_broken_hr = kd_full_hr * sa_ratio;
        const kd_broken_min = kd_broken_hr / 60;

        // Generate Dissolution Arrays
        diss_full_data = time_diss.map(t => calculateDissolution(t, kd_full_min * 4)); // multiplier for visual 60m scale
        diss_broken_data = time_diss.map(t => calculateDissolution(t, kd_broken_min * 4));

        // Generate PK Arrays via Simulation
        const simFull = simulatePK(D, kd_full_hr, Vd, ke, Vmax, Km, k_transit);
        const simBroken = simulatePK(D, kd_broken_hr, Vd, ke, Vmax, Km, k_transit);

        pk_full_data = simFull.profile;
        pk_broken_data = simBroken.profile;
        
        stats_full = { auc: simFull.auc, f: simFull.f };
        stats_broken = { auc: simBroken.auc, f: simBroken.f };
    }

    function initCharts() {
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = '#64748b';

        // Dissolution Chart
        const ctxDiss = document.getElementById('dissolutionChart').getContext('2d');
        dissChart = new Chart(ctxDiss, {
            type: 'line',
            data: {
                labels: time_diss,
                datasets: [
                    {
                        label: 'Full Tablet',
                        data: diss_full_data,
                        borderColor: '#94a3b8',
                        backgroundColor: 'rgba(148, 163, 184, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Broken in Half',
                        data: diss_broken_data,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        hidden: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: { title: { display: true, text: 'Time (minutes)' } },
                    y: { title: { display: true, text: '% Dissolved' }, min: 0, max: 100 }
                },
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });

        // PK Chart
        const ctxPK = document.getElementById('pkChart').getContext('2d');
        pkChart = new Chart(ctxPK, {
            type: 'line',
            data: {
                labels: time_pk,
                datasets: [
                    {
                        label: 'Full Tablet',
                        data: pk_full_data,
                        borderColor: '#94a3b8',
                        backgroundColor: 'rgba(148, 163, 184, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Broken in Half',
                        data: pk_broken_data,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        hidden: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: { title: { display: true, text: 'Time (hours)' } },
                    y: { title: { display: true, text: 'Plasma Concentration (µg/mL)' }, min: 0 }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} µg/mL` } }
                }
            }
        });
    }

    function updateState() {
        const isBroken = btnHalf.classList.contains('active');
        
        if (isBroken) {
            // Visuals
            fullGroup.classList.add('hidden');
            halfLeft.classList.remove('hidden');
            halfRight.classList.remove('hidden');
            setTimeout(() => { halfLeft.classList.add('active'); halfRight.classList.add('active'); }, 50);

            // Stats UI
            saIndicator.textContent = '1.32x';
            dissIndicator.textContent = 'Faster (+32%)';
            
            // Find max for broken
            let cmax = 0, tmax = 0;
            pk_broken_data.forEach((val, i) => { if(val > cmax) { cmax = val; tmax = time_pk[i]; } });
            
            cmaxValue.textContent = `${cmax.toFixed(2)} µg/mL`;
            tmaxValue.textContent = `${tmax.toFixed(2)} hr`;
            aucValue.textContent = `${stats_broken.auc.toFixed(2)} µg·hr/mL`;
            fValue.textContent = `${stats_broken.f.toFixed(1)}%`;
            
            // Highlights
            fValue.style.color = 'var(--secondary)';
            cmaxValue.style.color = 'var(--secondary)';
            tmaxValue.style.color = 'var(--secondary)';

            // Update Charts
            dissChart.data.datasets[1].hidden = false;
            dissChart.data.datasets[0].borderColor = '#cbd5e1';
            pkChart.data.datasets[1].hidden = false;
            pkChart.data.datasets[0].borderColor = '#cbd5e1';
        } else {
            // Visuals
            halfLeft.classList.remove('active');
            halfRight.classList.remove('active');
            setTimeout(() => { halfLeft.classList.add('hidden'); halfRight.classList.add('hidden'); fullGroup.classList.remove('hidden'); }, 400);

            // Stats UI
            saIndicator.textContent = '1.00x';
            dissIndicator.textContent = 'Standard';
            
            // Find max for full
            let cmax = 0, tmax = 0;
            pk_full_data.forEach((val, i) => { if(val > cmax) { cmax = val; tmax = time_pk[i]; } });
            
            cmaxValue.textContent = `${cmax.toFixed(2)} µg/mL`;
            tmaxValue.textContent = `${tmax.toFixed(2)} hr`;
            aucValue.textContent = `${stats_full.auc.toFixed(2)} µg·hr/mL`;
            fValue.textContent = `${stats_full.f.toFixed(1)}%`;

            // Reset Highlights
            fValue.style.color = 'inherit';
            cmaxValue.style.color = 'inherit';
            tmaxValue.style.color = 'inherit';

            // Update Charts
            dissChart.data.datasets[1].hidden = true;
            dissChart.data.datasets[0].borderColor = '#94a3b8';
            pkChart.data.datasets[1].hidden = true;
            pkChart.data.datasets[0].borderColor = '#94a3b8';
        }
        
        dissChart.update();
        pkChart.update();
    }

    // Input Listeners
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            recalculateData();
            
            // Soft update charts data
            dissChart.data.datasets[0].data = diss_full_data;
            dissChart.data.datasets[1].data = diss_broken_data;
            pkChart.data.datasets[0].data = pk_full_data;
            pkChart.data.datasets[1].data = pk_broken_data;
            
            updateState();
        });
    });

    btnFull.addEventListener('click', () => {
        btnFull.classList.add('active');
        btnHalf.classList.remove('active');
        updateState();
    });
    
    btnHalf.addEventListener('click', () => {
        btnFull.classList.remove('active');
        btnHalf.classList.add('active');
        updateState();
    });

    // Bootstrap
    recalculateData();
    initCharts();
    updateState();
});
