import type { UrbaneApp } from './app';
import { SCORE_FIELD, SKY_EXPOSURE_FIELD } from './analysis';

export function initUi(app: UrbaneApp): void {
    initDrillDownButton(app);
    initThematicSelect(app);
    initWeightSliders(app);
    initPlotPanel();
}

function initDrillDownButton(app: UrbaneApp): void {
    const btn = document.querySelector('#levelBtn') as HTMLButtonElement;
    const iconDown = document.querySelector('#levelBtnDown') as HTMLElement;
    const iconUp = document.querySelector('#levelBtnUp') as HTMLElement;
    const thematicSelect = document.querySelector('#thematicSelect') as HTMLSelectElement;

    updateLevelButtonState(app, btn, iconDown, iconUp);

    btn.addEventListener('click', async () => {
        btn.disabled = true;

        if (app.currentLevel === 'neighborhoods') await app.drillDown(thematicSelect.value);
        else await app.drillUp(thematicSelect.value);

        updateLevelButtonState(app, btn, iconDown, iconUp);
        btn.disabled = false;
    });
}

function initThematicSelect(app: UrbaneApp): void {
    const select = document.querySelector('#thematicSelect') as HTMLSelectElement;

    [{ value: 'none', text: 'None' }, { value: SCORE_FIELD, text: 'Score' }].forEach(({ value, text }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
    });

    app.datasets.forEach((dataset) => {
        const opt = document.createElement('option');
        opt.value = `sjoin.count.${dataset}`;
        opt.textContent = dataset.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
        select.appendChild(opt);
    });

    const skyOpt = document.createElement('option');
    skyOpt.value = SKY_EXPOSURE_FIELD;
    skyOpt.textContent = 'Sky Exposure';
    select.appendChild(skyOpt);

    select.addEventListener('change', () => app.updateThematic(select.value));
}

function initWeightSliders(app: UrbaneApp): void {
    const slidersContainer = document.querySelector('#weightsSliders') as HTMLElement;
    const panel = document.querySelector('#weightsPanel') as HTMLElement;

    const allWeights = [...app.weights, app.skyExposureWeight];
    const allLabels = [
        ...app.datasets.map((dataset) => dataset.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())),
        'Sky Exposure',
    ];

    allWeights.forEach((weight, index) => {
        const col = document.createElement('div');
        col.className = 'weight-col';

        const valueLabel = document.createElement('span');
        valueLabel.className = 'weight-value';
        valueLabel.textContent = weight.toFixed(2);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = String(weight);
        slider.className = 'weight-slider';
        slider.addEventListener('input', () => {
            const allSliders = [...document.querySelectorAll<HTMLInputElement>('.weight-slider')];
            const othersSum = allSliders.filter((item) => item !== slider).reduce((sum, item) => sum + +item.value, 0);
            const maxVal = +Math.max(0, 1 - othersSum).toFixed(2);
            if (+slider.value > maxVal) slider.value = String(maxVal);
            valueLabel.textContent = (+slider.value).toFixed(2);
        });

        const nameLabel = document.createElement('span');
        nameLabel.className = 'weight-label';
        nameLabel.textContent = allLabels[index];

        col.append(valueLabel, slider, nameLabel);
        slidersContainer.appendChild(col);
    });

    const computeBtn = document.createElement('button');
    computeBtn.id = 'weightsCompute';
    computeBtn.textContent = 'Compute Score';
    computeBtn.addEventListener('click', () => {
        const weights = [...document.querySelectorAll<HTMLInputElement>('.weight-slider')].map((slider) => +slider.value);
        app.updateWeights(weights, (document.querySelector('#thematicSelect') as HTMLSelectElement).value);
    });
    panel.appendChild(computeBtn);
}

function initPlotPanel(): void {
    const plot = document.querySelector('#plot') as HTMLElement;
    const bar = document.querySelector('#plotBar') as HTMLElement;
    const toggle = document.querySelector('#plotToggle') as HTMLElement;
    let startX = 0;
    let startY = 0;

    plot.classList.add('hidden-plot');
    toggle.addEventListener('click', () => plot.classList.toggle('hidden-plot'));

    bar.addEventListener('pointerdown', (event) => {
        startX = event.clientX;
        startY = event.clientY;
        bar.setPointerCapture(event.pointerId);
    });

    bar.addEventListener('pointermove', (event) => {
        if (!bar.hasPointerCapture(event.pointerId)) return;
        plot.style.left = plot.offsetLeft + (event.clientX - startX) + 'px';
        plot.style.top = plot.offsetTop + (event.clientY - startY) + 'px';
        startX = event.clientX;
        startY = event.clientY;
    });

    bar.addEventListener('pointerup', (event) => bar.releasePointerCapture(event.pointerId));
}


export function setLoadingState(message: string, note?: string): void {
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? '';
}

export function hideLoading(): void {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

export function showError(message: string, note?: string): void {
    const overlay = document.getElementById('loading-overlay');
    const title = document.getElementById('loading-title');
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('error');
    if (title) title.textContent = 'Loading Error';
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? 'Please reload the page and try again.';
}


function updateLevelButtonState(app: UrbaneApp, btn: HTMLButtonElement, iconDown: HTMLElement, iconUp: HTMLElement): void {
    if (app.currentLevel === 'active_buildings') {
        iconDown.style.display = 'none';
        iconUp.style.display = '';
        btn.title = 'Back to neighborhoods';
        return;
    }

    iconDown.style.display = '';
    iconUp.style.display = 'none';
    btn.title = 'Drill into buildings';
}
