import { FILE_TYPE } from 'constants/file';
import { EnteFile } from 'types/file';
import { MergedSourceURL } from 'types/gallery';
import { logError } from 'utils/sentry';
import { t } from 'i18next';
import { getFileFromURL, getPlayableVideo } from 'utils/file';
import { addLogLine } from 'utils/logging';
import { getFileType } from 'services/typeDetectionService';

const WAIT_FOR_VIDEO_PLAYBACK = 1 * 1000;

export async function isPlaybackPossible(url: string): Promise<boolean> {
    return await new Promise((resolve) => {
        const t = setTimeout(() => {
            resolve(false);
        }, WAIT_FOR_VIDEO_PLAYBACK);
        const video = document.createElement('video');
        video.addEventListener('canplay', function () {
            clearTimeout(t);
            resolve(true);
        });
        video.src = url;
    });
}

export async function playVideo(livePhotoVideo, livePhotoImage) {
    const videoPlaying = !livePhotoVideo.paused;
    if (videoPlaying) return;
    livePhotoVideo.style.opacity = 1;
    livePhotoImage.style.opacity = 0;
    livePhotoVideo.load();
    livePhotoVideo.play().catch(() => {
        pauseVideo(livePhotoVideo, livePhotoImage);
    });
}

export async function pauseVideo(livePhotoVideo, livePhotoImage) {
    const videoPlaying = !livePhotoVideo.paused;
    if (!videoPlaying) return;
    livePhotoVideo.pause();
    livePhotoVideo.style.opacity = 0;
    livePhotoImage.style.opacity = 1;
}

export function updateFileMsrcProps(file: EnteFile, url: string) {
    file.msrc = url;
    if (file.metadata.fileType === FILE_TYPE.VIDEO) {
        file.html = `
                <div class="pswp-item-container">
                    <img src="${url}" onContextMenu="return false;"/>
                    <div class="spinner-border text-light" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>
            `;
    } else if (file.metadata.fileType === FILE_TYPE.LIVE_PHOTO) {
        file.html = `
                <div class="pswp-item-container">
                    <img src="${url}" onContextMenu="return false;"/>
                    <div class="spinner-border text-light" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>
            `;
    } else if (file.metadata.fileType === FILE_TYPE.IMAGE) {
        file.src = url;
    } else {
        logError(
            Error(`unknown file type - ${file.metadata.fileType}`),
            'Unknown file type'
        );
        file.src = url;
    }
}

export async function updateFileSrcProps(
    file: EnteFile,
    mergedURL: MergedSourceURL
) {
    const urls = {
        original: mergedURL.original.split(','),
        converted: mergedURL.converted.split(','),
    };
    let originalImageURL;
    let originalVideoURL;
    let convertedImageURL;
    let convertedVideoURL;
    let originalURL;
    if (file.metadata.fileType === FILE_TYPE.LIVE_PHOTO) {
        [originalImageURL, originalVideoURL] = urls.original;
        [convertedImageURL, convertedVideoURL] = urls.converted;
    } else if (file.metadata.fileType === FILE_TYPE.VIDEO) {
        [originalVideoURL] = urls.original;
        [convertedVideoURL] = urls.converted;
    } else if (file.metadata.fileType === FILE_TYPE.IMAGE) {
        [originalImageURL] = urls.original;
        [convertedImageURL] = urls.converted;
    } else {
        [originalURL] = urls.original;
    }

    const isPlayable =
        convertedVideoURL && (await isPlaybackPossible(convertedVideoURL));

    file.w = window.innerWidth;
    file.h = window.innerHeight;
    file.isSourceLoaded = true;
    file.originalImageURL = originalImageURL;
    file.originalVideoURL = originalVideoURL;

    if (file.metadata.fileType === FILE_TYPE.VIDEO) {
        if (isPlayable) {
            file.html = `
            <video controls onContextMenu="return false;">
                <source src="${convertedVideoURL}" />
                Your browser does not support the video tag.
            </video>
        `;
        } else {
            addLogLine(
                'video not playable, downloading original video and converting it to playable format'
            );
            const fileObject = await getFileFromURL(originalVideoURL);
            const fileType = getFileType(fileObject);
            logError(Error(''), 'video format not supported', {
                fileType,
            });
            const originalFileData = new Uint8Array(
                await fileObject.arrayBuffer()
            );
            const convertedVideoURL = URL.createObjectURL(
                await getPlayableVideo(file.metadata.title, originalFileData)
            );
            addLogLine("video converted, updating it's url");
            const isPlayable = await isPlaybackPossible(convertedVideoURL);
            if (isPlayable) {
                file.html = `
                <video controls onContextMenu="return false;">
                    <source src="${convertedVideoURL}" />
                    Your browser does not support the video tag.
                </video>
            `;
            } else {
                file.html = `
                <div class="pswp-item-container">
                    <img src="${file.msrc}" onContextMenu="return false;"/>
                    <div class="download-banner" >
                        ${t('VIDEO_PLAYBACK_FAILED_DOWNLOAD_INSTEAD')}
                        <a class="btn btn-outline-success" href=${originalVideoURL} download="${
                    file.metadata.title
                }">${t('DOWNLOAD')}</a>
                    </div>
                </div>
                `;
            }
        }
    } else if (file.metadata.fileType === FILE_TYPE.LIVE_PHOTO) {
        if (isPlayable) {
            file.html = `
                <div class = 'pswp-item-container'>
                    <img id = "live-photo-image-${file.id}" src="${convertedImageURL}" onContextMenu="return false;"/>
                    <video id = "live-photo-video-${file.id}" loop muted onContextMenu="return false;">
                        <source src="${convertedVideoURL}" />
                        Your browser does not support the video tag.
                    </video>
                </div>
                `;
        } else {
            file.html = `
                <div class="pswp-item-container">
                    <img src="${file.msrc}" onContextMenu="return false;"/>
                    <div class="download-banner">
                        ${t('VIDEO_PLAYBACK_FAILED_DOWNLOAD_INSTEAD')}
                        <button class = "btn btn-outline-success" id = "download-btn-${
                            file.id
                        }">Download</button>
                    </div>
                </div>
                `;
        }
    } else if (file.metadata.fileType === FILE_TYPE.IMAGE) {
        file.src = convertedImageURL;
    } else {
        logError(
            Error(`unknown file type - ${file.metadata.fileType}`),
            'Unknown file type'
        );
        file.src = originalURL;
    }
}
