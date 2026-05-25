import { UrbaneApp } from './app';
import { hideLoading, initUi, showError } from './ui';

async function main(): Promise<void> {
    try {
        const canvas = document.querySelector('canvas');
        const plotTable = document.querySelector('#plotBodyTable') as HTMLElement;
        const plotPcoords = document.querySelector('#plotBodyParallel') as HTMLElement;

        if (!canvas || !plotPcoords || !plotTable) {
            throw new Error('Canvas or plot body element not found.');
        }

        const app = new UrbaneApp();
        await app.init({ canvas, plotDivParallel: plotPcoords, plotDivTable: plotTable });

        hideLoading();
        initUi(app);
    } catch (error) {
        console.error(error);
        showError('Failed to load the Urbane case study.', 'Please verify the dataset paths and reload the page.');
    }
}

main();
