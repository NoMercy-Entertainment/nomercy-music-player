import type { ConstructorOptions } from 'audiomotion-analyzer';

let AudioMotionAnalyzer: typeof import('audiomotion-analyzer').default | undefined;

async function loadAudioMotion(): Promise<typeof import('audiomotion-analyzer').default | undefined> {
    if (AudioMotionAnalyzer) return AudioMotionAnalyzer;
    try {
        const mod = await import('audiomotion-analyzer');
        AudioMotionAnalyzer = mod.default;
        return AudioMotionAnalyzer;
    } catch {
        AudioMotionAnalyzer = undefined;
        return undefined;
    }
}

const spectrumAnalyser = async (audio: HTMLAudioElement, config?: ConstructorOptions): Promise<InstanceType<typeof import('audiomotion-analyzer').default> | undefined> => {
    const Analyzer = await loadAudioMotion();
    if (!Analyzer) {
        console.warn('[nomercy-music-player] audiomotion-analyzer is not installed. Spectrum visualization is disabled.');
        return undefined;
    }
    return new Analyzer({
        source: audio,
        ...config,
    });
};

export {
    AudioMotionAnalyzer,
    type ConstructorOptions,
    spectrumAnalyser,
};
