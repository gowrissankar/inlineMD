Title: Live Content

Description: Fetched live

Source: https://raw.githubusercontent.com/microsoft/vscode/main/extensions/markdown-language-features/preview-src/index.ts

---

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker';
import { onceDocumentLoaded } from './events';
import { createPosterForVsCode } from './messaging';
import { getEditorLineNumberForPageOffset, getElementsForSourceLine, getElementsForSourceLineRange, getLineElementForFragment, scrollToRevealSourceLine } from './scroll-sync';
import { SettingsManager, getData, getRawData } from './settings';
import throttle = require('lodash.throttle');
import morphdom from 'morphdom';
import type { MarkdownPreviewChangeIndicator, MarkdownPreviewInnerChange, MarkdownPreviewLineChanges, ToWebviewMessage } from '../types/previewMessaging';
import { isOfScheme, Schemes } from '../src/util/schemes';
import { DiffScrollSyncManager } from './diffScrollSync';

let scrollDisabledCount = 0;
let scrollDisabledTimer: number | undefined;

const marker = new ActiveLineMarker();
const settings = new SettingsManager();

let documentVersion = 0;
let documentResource = settings.settings.source;
let lineChanges = settings.settings.lineChanges;

const vscode = acquireVsCodeApi();

const onDiffScroll = (mappedLine: number) => {
	scrollDisabledCount = 1;
	if (scrollDisabledTimer) {
		clearTimeout(scrollDisabledTimer);
	}
	scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 100);
	doAfterImagesLoaded(() => scrollToRevealSourceLine(mappedLine, documentVersion, settings));
};
const diffScrollSyncManager = settings.settings.diffScrollSync
	? new DiffScrollSyncManager(settings.settings.diffScrollSync, onDiffScroll)
	: undefined;

interface State {
	scrollProgress?: number;
	resource?: string;
	line?: number;
	fragment?: string;
}

const originalState: State = vscode.getState() ?? {};
const state: State = {
	...originalState,
	...getData<Partial<State>>('data-state')
};

const hasStartingLine = typeof settings.settings.line === 'number' && !isNaN(settings.settings.line);
if (typeof originalState.scrollProgress !== 'undefined'
	&& (originalState?.resource !== state.resource || (hasStartingLine && originalState.line !== settings.settings.line))) {
	state.scrollProgress = undefined;
}

// Make sure to sync VS Code state here
vscode.setState(state);

const messaging = createPosterForVsCode(vscode, settings);

window.cspAlerter.setPoster(messaging);
window.styleLoadingMonitor.setPoster(messaging);


function doAfterImagesLoaded(cb: () => void) {
	const imgElements = document.getElementsByTagName('img');
	if (imgElements.length > 0) {
		const ps = Array.from(imgElements, e => {
			if (e.complete) {
				return Promise.resolve();
			} else {
				return new Promise<void>((resolve) => {
					e.addEventListener('load', () => resolve());
					e.addEventListener('error', () => resolve());
				});
			}
		});
		Promise.all(ps).then(() => setTimeout(cb, 0));
	} else {
		setTimeout(cb, 0);
	}
}

onceDocumentLoaded(() => {
	// Load initial html
	const htmlParser = new DOMParser();
	const markDownHtml = htmlParser.parseFromString(
		getRawData('data-initial-md-content'),
		'text/html'
	);

	const newElements = [...markDownHtml.body.children];
	document.body.append(...newElements);
	for (const el of newElements) {
		if (el instanceof HTMLElement) {
			domEval(el);
		}
	}

	// Restore
	const scrollProgress = state.scrollProgress;
	addImageContexts();
	applyLineChanges(lineChanges);
	if (typeof scrollProgress === 'number' && !settings.settings.fragment) {
		doAfterImagesLoaded(() => {
			scrollDisabledCount = 1;
			if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
			scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
			// Always set scroll of at least 1 to prevent VS Code's webview code from auto scrolling us
			const scrollToY = Math.max(1, scrollProgress * document.body.clientHeight);
			window.scrollTo(0, scrollToY);
		});
		return;
	}

	if (settings.settings.scrollPreviewWithEditor) {
		doAfterImagesLoaded(() => {
			// Try to scroll to fragment if available
			if (settings.settings.fragment) {
				let fragment: string;
				try {
					fragment = encodeURIComponent(settings.settings.fragment);
				} catch {
					fragment = settings.settings.fragment;
				}
				state.fragment = undefined;
				vscode.setState(state);

				const element = getLineElementForFragment(fragment, documentVersion);
				if (element) {
					scrollDisabledCount = 1;
					if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
					scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
					scrollToRevealSourceLine(element.line, documentVersion, settings);
				}
			} else {
				if (!isNaN(settings.settings.line!)) {
					scrollDisabledCount = 1;
					if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
					scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
					scrollToRevealSourceLine(settings.settings.line!, documentVersion, settings);
				}
			}
		});
	}

	if (typeof settings.settings.selectedLine === 'number') {
		marker.onDidChangeTextEditorSelection(settings.settings.selectedLine, documentVersion);
	}
});

const onUpdateView = (() => {
	const doScroll = throttle((line: number) => {
		scrollDisabledCount = 1;
		if (scrollDisabledTimer) {
			clearTimeout(scrollDisabledTimer);
		}
		scrollDisabledTimer = window.setTimeout(() => {
			scrollDisabledCount = 0;
		}, 50);
		doAfterImagesLoaded(() => scrollToRevealSourceLine(line, documentVersion, settings));
	}, 50);

	return (line: number) => {
		if (!isNaN(line)) {
			state.line = line;

			doScroll(line);
		}
	};
})();

window.addEventListener('resize', () => {
	scrollDisabledCount = 1;
	if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
	scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
	updateScrollProgress();
}, true);

function addImageContexts() {
	const images = document.getElementsByTagName('img');
	let idNumber = 0;
	for (const img of images) {
		img.id = 'image-' + idNumber;
		idNumber += 1;
		const imageSource = img.getAttribute('data-src');
		const isLocalFile = imageSource && !(isOfScheme(Schemes.http, imageSource) || isOfScheme(Schemes.https, imageSource));
		const webviewSection = isLocalFile ? 'localImage' : 'image';
		img.setAttribute('data-vscode-context', JSON.stringify({ webviewSection, id: img.id, 'preventDefaultContextMenuItems': true, resource: documentResource, imageSource }));
	}
}

async function copyImage(image: HTMLImageElement, retries = 5) {
	if (!document.hasFocus() && retries > 0) {
		// copyImage is called at the same time as webview.reveal, which means this function is running whilst the webview is gaining focus.
		// Since navigator.clipboard.write requires the docume

