<script lang="ts">
	import { onMount } from 'svelte';
	import LZString from 'lz-string';
	import { convertBattleLogToReplay, parseLogFilename, type BattleLogItem } from '$lib/index.js';
	import Icon from '$lib/components/Icon.svelte';

	interface ToastItem {
		id: number;
		message: string;
		type: 'info' | 'success' | 'warning' | 'error';
	}

	let allLogs = $state<BattleLogItem[]>([]);
	let searchWorld = $state('');
	let searchMap = $state('');
	let searchCell = $state('');
	let sortOrder = $state<'desc' | 'asc'>('desc');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let actionLoadingId = $state<string | null>(null);
	let toasts = $state<ToastItem[]>([]);
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let singleFileInputRef = $state<HTMLInputElement | null>(null);
	let isDark = $state(false);
	let isDragging = $state(false);
	let dragCounter = 0;

	const pageSize = 50;

	onMount(() => {
		// Why not rely purely on system preference: User explicit choice should persist across browser sessions.
		const saved = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		isDark = saved ? saved === 'dark' : prefersDark;
		document.documentElement.classList.toggle('dark', isDark);
	});

	function toggleTheme() {
		isDark = !isDark;
		localStorage.setItem('theme', isDark ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', isDark);
	}

	// Why not global counter: Local incrementing integer guarantees unique IDs per toast notification.
	let nextToastId = 0;
	function addToast(message: string, type: ToastItem['type'] = 'info') {
		const id = ++nextToastId;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	function removeToast(id: number) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function mergeLogs(newItems: BattleLogItem[]) {
		if (newItems.length === 0) {
			addToast('有効な .txt 戦闘ログが見つかりませんでした', 'warning');
			return;
		}

		// Why not discard previous logs: Users may load individual battle files alongside an indexed folder.
		const newIds = new Set(newItems.map((item) => item.id));
		allLogs = [...newItems, ...allLogs.filter((item) => !newIds.has(item.id))];
		currentPage = 1;
		addToast(`${newItems.length.toLocaleString()} 件の戦闘ログを読み込みました`, 'info');
	}

	async function selectFiles() {
		// Why not restrict to showOpenFilePicker: File System Access API is not supported in Firefox and WebKit browsers.
		if ('showOpenFilePicker' in window) {
			try {
				const handles = await (
					window as unknown as {
						showOpenFilePicker: (options?: {
							multiple?: boolean;
							types?: Array<{
								description: string;
								accept: Record<string, string[]>;
							}>;
						}) => Promise<FileSystemFileHandle[]>;
					}
				).showOpenFilePicker({
					multiple: true,
					types: [
						{
							description: '戦闘ログテキスト (*.txt)',
							accept: {
								'text/plain': ['.txt']
							}
						}
					]
				});

				if (!handles || handles.length === 0) return;

				isLoading = true;
				const items: BattleLogItem[] = [];
				for (const handle of handles) {
					if (handle.name.endsWith('.txt')) {
						const parsed = parseLogFilename(handle.name);
						items.push({
							id: handle.name,
							filename: handle.name,
							handle,
							...parsed
						});
					}
				}

				mergeLogs(items);
			} catch (error) {
				const domErr = error as DOMException;
				if (domErr?.name !== 'AbortError') {
					addToast(`ファイル選択に失敗しました: ${domErr.message || String(error)}`, 'error');
				}
			} finally {
				isLoading = false;
			}
		} else if (singleFileInputRef) {
			singleFileInputRef.click();
		}
	}

	function handleSingleFileInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		isLoading = true;
		const items: BattleLogItem[] = [];
		const files = target.files;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.name.endsWith('.txt')) {
				const parsed = parseLogFilename(file.name);
				items.push({
					id: `${file.name}_${Date.now()}_${i}`,
					filename: file.name,
					file,
					...parsed
				});
			}
		}

		mergeLogs(items);
		target.value = '';
		isLoading = false;
	}

	async function selectDirectory() {
		// Why not restrict to showDirectoryPicker: File System Access API is not supported in Firefox and WebKit browsers.
		if ('showDirectoryPicker' in window) {
			try {
				const dirHandle = await (
					window as unknown as {
						showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
					}
				).showDirectoryPicker();

				isLoading = true;
				const items: BattleLogItem[] = [];

				// Why not read file content here: Scanning tens of thousands of text files upfront would freeze the browser.
				for await (const entry of dirHandle.values()) {
					if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
						const parsed = parseLogFilename(entry.name);
						items.push({
							id: entry.name,
							filename: entry.name,
							handle: entry as FileSystemFileHandle,
							...parsed
						});
					}
				}

				mergeLogs(items);
			} catch (error) {
				const domErr = error as DOMException;
				if (domErr?.name !== 'AbortError') {
					addToast(`フォルダ選択に失敗しました: ${domErr.message || String(error)}`, 'error');
				}
			} finally {
				isLoading = false;
			}
		} else if (fileInputRef) {
			fileInputRef.click();
		}
	}

	function handleFileInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		isLoading = true;
		const items: BattleLogItem[] = [];
		const files = target.files;

		// Why not read body inside loop: Preserves memory by keeping only file references until user triggers an action.
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.name.endsWith('.txt')) {
				const parsed = parseLogFilename(file.name);
				items.push({
					id: `${file.name}_${Date.now()}_${i}`,
					filename: file.name,
					file,
					...parsed
				});
			}
		}

		mergeLogs(items);
		target.value = '';
		isLoading = false;
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			isDragging = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		isLoading = true;
		const items: BattleLogItem[] = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.name.endsWith('.txt')) {
				const parsed = parseLogFilename(file.name);
				items.push({
					id: `${file.name}_${Date.now()}_${i}`,
					filename: file.name,
					file,
					...parsed
				});
			}
		}

		mergeLogs(items);
		isLoading = false;
	}

	function clearSearch() {
		searchWorld = '';
		searchMap = '';
		searchCell = '';
		currentPage = 1;
	}

	const isFiltering = $derived(
		Boolean(searchWorld.trim() || searchMap.trim() || searchCell.trim())
	);

	const filteredLogs = $derived.by(() => {
		const w = searchWorld.trim().toLowerCase();
		const m = searchMap.trim().toLowerCase();
		const c = searchCell.trim().toLowerCase();
		let list = allLogs;

		if (w || m || c) {
			list = list.filter((item) => {
				if (w && !item.world.toLowerCase().includes(w)) return false;
				if (m && !item.map.toLowerCase().includes(m)) return false;
				if (c && !item.cell.toLowerCase().includes(c)) return false;
				return true;
			});
		}

		return list.slice().sort((a, b) => {
			// Why not date parsing for comparison: Lexicographical comparison of YYYYMMDD_HHMMSS strings is exact and fast.
			if (a.dateTimeSortKey && b.dateTimeSortKey) {
				return sortOrder === 'desc'
					? b.dateTimeSortKey.localeCompare(a.dateTimeSortKey)
					: a.dateTimeSortKey.localeCompare(b.dateTimeSortKey);
			}
			if (a.dateTimeSortKey) return sortOrder === 'desc' ? -1 : 1;
			if (b.dateTimeSortKey) return sortOrder === 'desc' ? 1 : -1;
			return sortOrder === 'desc'
				? b.filename.localeCompare(a.filename)
				: a.filename.localeCompare(b.filename);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / pageSize)));

	const paginatedLogs = $derived(
		filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	function toggleSortOrder() {
		sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
		currentPage = 1;
	}

	async function readFileAsText(file: File): Promise<string> {
		// Why not file.text(): ElectronicObserver logs may be encoded in Shift_JIS/CP932, requiring fallback when UTF-8 decoding fails.
		const buffer = await file.arrayBuffer();
		try {
			const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
			return utf8Decoder.decode(buffer);
		} catch {
			const sjisDecoder = new TextDecoder('shift_jis');
			return sjisDecoder.decode(buffer);
		}
	}

	async function getLogContent(item: BattleLogItem): Promise<string> {
		if (item.handle) {
			const file = await item.handle.getFile();
			return await readFileAsText(file);
		}
		if (item.file) {
			return await readFileAsText(item.file);
		}
		throw new Error('ファイル参照が存在しません');
	}

	async function handlePlay(item: BattleLogItem) {
		try {
			actionLoadingId = item.id;
			const text = await getLogContent(item);
			const replay = convertBattleLogToReplay(text);
			const jsonString = JSON.stringify(replay);

			// Why not plain uncompressed URL: Hash length above 2000 chars is dropped by browsers, but KC3Kai automatically extracts fromLZString.
			const compressed = LZString.compressToEncodedURIComponent(jsonString);
			const playerUrl = `https://kc3kai.github.io/kancolle-replay/battleplayer.html#fromLZString=${compressed}`;

			// Why not skip clipboard: Provides a manual paste backup in case popup window restrictions interfere with playback.
			await navigator.clipboard.writeText(jsonString);
			window.open(playerUrl, '_blank', 'noopener,noreferrer');
			addToast('リプレイヤーを開きました（JSONもクリップボードにコピー済み）', 'info');
		} catch (error) {
			addToast(
				`再生準備に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
				'error'
			);
		} finally {
			actionLoadingId = null;
		}
	}

	async function handleCopy(item: BattleLogItem) {
		try {
			actionLoadingId = item.id;
			const text = await getLogContent(item);
			const replay = convertBattleLogToReplay(text);
			const jsonString = JSON.stringify(replay, null, 2);
			await navigator.clipboard.writeText(jsonString);
			addToast('リプレイJSONをコピーしました', 'success');
		} catch (error) {
			addToast(
				`コピーに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
				'error'
			);
		} finally {
			actionLoadingId = null;
		}
	}

	async function handleDownload(item: BattleLogItem) {
		try {
			actionLoadingId = item.id;
			const text = await getLogContent(item);
			const replay = convertBattleLogToReplay(text);
			const jsonString = JSON.stringify(replay, null, 2);
			const blob = new Blob([jsonString], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${item.filename.replace(/\.txt$/, '')}.replay.json`;
			a.click();
			URL.revokeObjectURL(url);
			addToast('ダウンロードを開始しました', 'success');
		} catch (error) {
			addToast(
				`保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
				'error'
			);
		} finally {
			actionLoadingId = null;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex min-h-screen flex-col bg-solid-gray-50 font-sans text-solid-gray-900 transition-colors dark:bg-solid-gray-900 dark:text-white"
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<!-- ドラッグ＆ドロップ オーバーレイ -->
	{#if isDragging}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-900/10 backdrop-blur-xs dark:bg-blue-900/20"
		>
			<div
				class="flex flex-col items-center gap-2 rounded-8 border-2 border-dashed border-blue-900 bg-white px-10 py-8 shadow-2 dark:border-blue-400 dark:bg-solid-gray-800"
			>
				<Icon name="file-text" class="size-10 text-blue-900 dark:text-blue-400" />
				<p class="text-sm font-bold text-blue-900 dark:text-blue-300">
					戦闘ログテキスト (.txt) をここにドロップ
				</p>
				<p class="text-xs text-solid-gray-600 dark:text-solid-gray-300">
					単一または複数のログファイルを直接読み込みます
				</p>
			</div>
		</div>
	{/if}

	<!-- ヘッダー (DADS HeaderContainer準拠) -->
	<header
		class="sticky top-0 z-20 border-b border-solid-gray-300 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6 dark:border-solid-gray-700 dark:bg-solid-gray-800/95"
	>
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<h1 class="text-sm font-bold tracking-normal text-solid-gray-900 dark:text-white">
					艦これ バトルリプレイヤー
				</h1>
				<span
					class="rounded-4 border border-solid-gray-300 bg-solid-gray-100 px-2 py-0.5 text-[11px] font-medium text-solid-gray-700 dark:border-solid-gray-600 dark:bg-solid-gray-700 dark:text-solid-gray-300"
				>
					岩川版
				</span>
				{#if allLogs.length > 0}
					<span
						class="rounded-4 border border-solid-gray-300 bg-white px-2 py-0.5 font-mono text-xs text-solid-gray-700 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-300"
					>
						{allLogs.length.toLocaleString()} 件
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<!-- フォールバック用隠しインプット: 単一/複数ファイル -->
				<input
					type="file"
					accept=".txt"
					multiple
					class="hidden"
					bind:this={singleFileInputRef}
					onchange={handleSingleFileInput}
				/>
				<!-- フォールバック用隠しインプット: フォルダ -->
				<input
					type="file"
					webkitdirectory
					multiple
					class="hidden"
					bind:this={fileInputRef}
					onchange={handleFileInput}
				/>

				<button
					type="button"
					onclick={selectFiles}
					disabled={isLoading}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-4 border border-solid-gray-600 bg-white px-2.5 py-1 text-xs font-medium text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-4 focus-visible:outline-focus-yellow active:bg-solid-gray-200 disabled:opacity-40 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
					title="単一または複数の戦闘ログファイル (.txt) を選択"
				>
					<Icon name="file-text" class="size-3.5 text-solid-gray-600 dark:text-solid-gray-300" />
					<span>ファイル選択</span>
				</button>

				<button
					type="button"
					onclick={selectDirectory}
					disabled={isLoading}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-4 border border-solid-gray-600 bg-white px-2.5 py-1 text-xs font-medium text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-4 focus-visible:outline-focus-yellow active:bg-solid-gray-200 disabled:opacity-40 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
					title="BattleLogフォルダを選択"
				>
					<Icon name="folder" class="size-3.5 text-solid-gray-600 dark:text-solid-gray-300" />
					<span>{isLoading ? '走査中...' : 'フォルダ選択'}</span>
				</button>

				{#if allLogs.length > 0}
					<!-- 検索入力部: 海域 / 番号 / マス (DADS Search Box / Input準拠) -->
					<div class="flex items-center gap-1">
						<input
							type="text"
							placeholder="海域 (62)"
							bind:value={searchWorld}
							oninput={() => (currentPage = 1)}
							class="w-18 rounded-4 border border-solid-gray-420 bg-white px-2 py-1 text-xs text-solid-gray-900 placeholder-solid-gray-420 transition focus:border-blue-900 focus:ring-2 focus:ring-focus-yellow focus:outline-none dark:border-solid-gray-500 dark:bg-solid-gray-800 dark:text-white dark:placeholder-solid-gray-400 dark:focus:border-blue-400"
							title="海域で絞り込み (例: 62, 5, E2)"
						/>
						<span class="text-xs text-solid-gray-420 dark:text-solid-gray-500">-</span>
						<input
							type="text"
							placeholder="番号 (3)"
							bind:value={searchMap}
							oninput={() => (currentPage = 1)}
							class="w-16 rounded-4 border border-solid-gray-420 bg-white px-2 py-1 text-xs text-solid-gray-900 placeholder-solid-gray-420 transition focus:border-blue-900 focus:ring-2 focus:ring-focus-yellow focus:outline-none dark:border-solid-gray-500 dark:bg-solid-gray-800 dark:text-white dark:placeholder-solid-gray-400 dark:focus:border-blue-400"
							title="マップ番号で絞り込み (例: 3, 5)"
						/>
						<span class="text-xs text-solid-gray-420 dark:text-solid-gray-500">/</span>
						<input
							type="text"
							placeholder="マス (62)"
							bind:value={searchCell}
							oninput={() => (currentPage = 1)}
							class="w-18 rounded-4 border border-solid-gray-420 bg-white px-2 py-1 text-xs text-solid-gray-900 placeholder-solid-gray-420 transition focus:border-blue-900 focus:ring-2 focus:ring-focus-yellow focus:outline-none dark:border-solid-gray-500 dark:bg-solid-gray-800 dark:text-white dark:placeholder-solid-gray-400 dark:focus:border-blue-400"
							title="マス(セル)で絞り込み (例: 62, boss)"
						/>
						<button
							type="button"
							onclick={clearSearch}
							disabled={!isFiltering}
							class="cursor-pointer rounded-4 border border-solid-gray-420 bg-white px-2 py-1 text-xs text-solid-gray-700 transition hover:bg-solid-gray-100 focus-visible:outline-2 focus-visible:outline-focus-yellow disabled:cursor-not-allowed disabled:opacity-30 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-300 dark:hover:bg-solid-gray-700"
							title="検索条件をクリア"
						>
							クリア
						</button>
					</div>

					<button
						type="button"
						onclick={toggleSortOrder}
						class="inline-flex cursor-pointer items-center gap-1 rounded-4 border border-solid-gray-600 bg-white px-2.5 py-1 text-xs font-medium text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-2 focus-visible:outline-focus-yellow active:bg-solid-gray-200 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
						title="ソート順の切り替え"
					>
						<Icon
							name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
							class="size-3 text-solid-gray-600 dark:text-solid-gray-300"
						/>
						<span>{sortOrder === 'desc' ? '最新順' : '古い順'}</span>
					</button>
				{/if}

				<!-- テーマ切り替えボタン -->
				<button
					type="button"
					onclick={toggleTheme}
					class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-4 border border-solid-gray-600 bg-white text-xs text-solid-gray-700 transition hover:bg-solid-gray-100 focus-visible:outline-2 focus-visible:outline-focus-yellow dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-solid-gray-200 dark:hover:bg-solid-gray-700"
					title={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
					aria-label="テーマ切り替え"
				>
					<Icon name={isDark ? 'sun' : 'moon'} class="size-3.5" />
				</button>
			</div>
		</div>
	</header>

	<!-- メインコンテンツ -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 sm:p-6">
		{#if allLogs.length === 0}
			<!-- 空状態 (DADS Notice / Container準拠) -->
			<div
				class="my-auto flex flex-col items-center justify-center rounded-8 border border-solid-gray-300 bg-white p-10 text-center sm:p-12 dark:border-solid-gray-700 dark:bg-solid-gray-800"
			>
				<div
					class="mb-3 flex items-center justify-center gap-2 text-solid-gray-500 dark:text-solid-gray-400"
				>
					<Icon name="file-text" class="size-8" />
					<span class="text-solid-gray-300 dark:text-solid-gray-600">/</span>
					<Icon name="folder" class="size-8" />
				</div>
				<h2 class="text-base font-bold text-solid-gray-900 dark:text-white">
					戦闘ログファイルまたはフォルダを選択してください
				</h2>
				<p
					class="mt-2 max-w-md text-xs leading-relaxed text-solid-gray-600 dark:text-solid-gray-300"
				>
					七四式電子観測儀の戦闘詳細ログ（<code
						class="rounded-4 border border-solid-gray-300 bg-solid-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-solid-gray-800 dark:border-solid-gray-600 dark:bg-solid-gray-700 dark:text-solid-gray-200"
						>.txt</code
					>）、または
					<code
						class="rounded-4 border border-solid-gray-300 bg-solid-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-solid-gray-800 dark:border-solid-gray-600 dark:bg-solid-gray-700 dark:text-solid-gray-200"
						>BattleLog</code
					> フォルダを選択してください。ファイルを直接画面にドラッグ＆ドロップすることも可能です。
				</p>
				<div class="mt-5 flex flex-wrap items-center justify-center gap-3">
					<button
						type="button"
						onclick={selectFiles}
						disabled={isLoading}
						class="inline-flex cursor-pointer items-center gap-2 rounded-4 bg-blue-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-blue-1000 focus-visible:outline-4 focus-visible:outline-focus-yellow active:bg-blue-1100 disabled:opacity-40 dark:bg-blue-800 dark:hover:bg-blue-700"
					>
						<Icon name="file-text" class="size-4" />
						<span>{isLoading ? '読み込み中...' : 'ファイルを選択する'}</span>
					</button>
					<button
						type="button"
						onclick={selectDirectory}
						disabled={isLoading}
						class="inline-flex cursor-pointer items-center gap-2 rounded-4 border border-solid-gray-600 bg-white px-5 py-2 text-xs font-bold text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-4 focus-visible:outline-focus-yellow active:bg-solid-gray-200 disabled:opacity-40 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
					>
						<Icon name="folder" class="size-4" />
						<span>{isLoading ? '読み込み中...' : 'BattleLog フォルダを開く'}</span>
					</button>
				</div>
			</div>
		{:else if filteredLogs.length === 0}
			<div
				class="my-16 flex flex-col items-center justify-center rounded-4 border border-solid-gray-300 bg-white p-8 text-center text-solid-gray-600 dark:border-solid-gray-700 dark:bg-solid-gray-800 dark:text-solid-gray-300"
			>
				<p class="text-xs">条件に一致する戦闘ログが見つかりませんでした。</p>
				<button
					type="button"
					onclick={clearSearch}
					class="mt-2 cursor-pointer text-xs font-medium text-blue-900 underline hover:text-blue-1000 dark:text-blue-300 dark:hover:text-blue-200"
				>
					検索条件をクリア
				</button>
			</div>
		{:else}
			<!-- テーブル (DADS Table準拠) -->
			<div
				class="flex-1 overflow-hidden rounded-4 border border-solid-gray-300 bg-white dark:border-solid-gray-700 dark:bg-solid-gray-800"
			>
				<div class="overflow-x-auto">
					<table class="w-full table-fixed border-collapse text-left text-xs">
						<thead>
							<tr
								class="border-b-2 border-solid-gray-600 bg-solid-gray-100 font-bold text-solid-gray-900 dark:border-solid-gray-400 dark:bg-solid-gray-700/80 dark:text-white"
							>
								<th class="w-40 px-3 py-2.5">日時</th>
								<th class="w-20 px-3 py-2.5">海域</th>
								<th class="w-16 px-3 py-2.5">番号</th>
								<th class="w-20 px-3 py-2.5">マス</th>
								<th class="px-3 py-2.5">ファイル名</th>
								<th class="w-44 px-3 py-2.5 text-right">操作</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-solid-gray-200 dark:divide-solid-gray-700">
							{#each paginatedLogs as item (item.id)}
								<tr
									class="transition-colors hover:bg-solid-gray-50 dark:hover:bg-solid-gray-700/40"
								>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-solid-gray-800 tabular-nums dark:text-solid-gray-200"
									>
										{item.dateTimeStr}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-solid-gray-800 dark:text-solid-gray-200"
									>
										{#if item.isPractice}
											<span
												class="rounded-4 border border-green-800 bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-900 dark:border-green-500 dark:bg-green-950/40 dark:text-green-300"
											>
												演習
											</span>
										{:else}
											{item.world}
										{/if}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-solid-gray-800 dark:text-solid-gray-200"
									>
										{item.map}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-solid-gray-800 dark:text-solid-gray-200"
									>
										{item.cell}
									</td>
									<td
										class="truncate px-3 py-2 font-mono text-solid-gray-500 dark:text-solid-gray-400"
										title={item.filename}
									>
										{item.filename}
									</td>
									<td class="px-3 py-2 text-right whitespace-nowrap">
										<div class="inline-flex items-center justify-end gap-1">
											<button
												type="button"
												onclick={() => handlePlay(item)}
												disabled={actionLoadingId === item.id}
												class="inline-flex cursor-pointer items-center gap-1 rounded-4 bg-blue-900 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-blue-1000 focus-visible:outline-2 focus-visible:outline-focus-yellow active:bg-blue-1100 disabled:opacity-40 dark:bg-blue-800 dark:hover:bg-blue-700"
												title="KC3Kaiリプレイヤーで開く（クリップボードにもJSONコピー）"
											>
												<Icon name="play" class="size-2.5 fill-current" />
												<span>再生</span>
											</button>
											<button
												type="button"
												onclick={() => handleCopy(item)}
												disabled={actionLoadingId === item.id}
												class="inline-flex cursor-pointer items-center gap-1 rounded-4 border border-solid-gray-600 bg-white px-2 py-1 text-xs font-medium text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-2 focus-visible:outline-focus-yellow active:bg-solid-gray-200 disabled:opacity-40 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
												title="リプレイJSONをコピー"
											>
												<Icon
													name="copy"
													class="size-3 text-solid-gray-600 dark:text-solid-gray-400"
												/>
												<span>コピー</span>
											</button>
											<button
												type="button"
												onclick={() => handleDownload(item)}
												disabled={actionLoadingId === item.id}
												class="inline-flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded-4 border border-solid-gray-600 bg-white text-xs text-solid-gray-900 transition hover:bg-solid-gray-100 focus-visible:outline-2 focus-visible:outline-focus-yellow active:bg-solid-gray-200 disabled:opacity-40 dark:border-solid-gray-400 dark:bg-solid-gray-800 dark:text-white dark:hover:bg-solid-gray-700"
												title=".replay.json をダウンロード"
												aria-label="JSONダウンロード"
											>
												<Icon
													name="download"
													class="size-3 text-solid-gray-600 dark:text-solid-gray-400"
												/>
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- ページ送りフッター (DADS Pagination準拠) -->
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-t border-solid-gray-300 bg-solid-gray-50 px-3 py-2 text-xs text-solid-gray-700 dark:border-solid-gray-700 dark:bg-solid-gray-800/80 dark:text-solid-gray-300"
				>
					<div>
						<span>
							全 {filteredLogs.length.toLocaleString()} 件中
							<span class="font-bold tabular-nums">
								{((currentPage - 1) * pageSize + 1).toLocaleString()}
							</span>
							〜
							<span class="font-bold tabular-nums">
								{Math.min(currentPage * pageSize, filteredLogs.length).toLocaleString()}
							</span>
							件目を表示
						</span>
					</div>

					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={() => (currentPage = 1)}
							disabled={currentPage <= 1}
							class="inline-flex h-6 w-6 items-center justify-center rounded-4 border border-solid-gray-420 bg-white text-solid-gray-800 transition hover:bg-solid-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-200 dark:hover:bg-solid-gray-700"
							title="最初のページ"
							aria-label="最初のページ"
						>
							<Icon name="chevrons-left" class="size-3" />
						</button>
						<button
							type="button"
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage <= 1}
							class="inline-flex items-center gap-0.5 rounded-4 border border-solid-gray-420 bg-white px-2 py-0.5 text-solid-gray-800 transition hover:bg-solid-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-200 dark:hover:bg-solid-gray-700"
						>
							<Icon name="chevron-left" class="size-3" />
							<span>前へ</span>
						</button>
						<span
							class="px-2 font-mono text-xs font-medium text-solid-gray-900 dark:text-solid-gray-100"
						>
							{currentPage} / {totalPages}
						</span>
						<button
							type="button"
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage >= totalPages}
							class="inline-flex items-center gap-0.5 rounded-4 border border-solid-gray-420 bg-white px-2 py-0.5 text-solid-gray-800 transition hover:bg-solid-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-200 dark:hover:bg-solid-gray-700"
						>
							<span>次へ</span>
							<Icon name="chevron-right" class="size-3" />
						</button>
						<button
							type="button"
							onclick={() => (currentPage = totalPages)}
							disabled={currentPage >= totalPages}
							class="inline-flex h-6 w-6 items-center justify-center rounded-4 border border-solid-gray-420 bg-white text-solid-gray-800 transition hover:bg-solid-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-solid-gray-600 dark:bg-solid-gray-800 dark:text-solid-gray-200 dark:hover:bg-solid-gray-700"
							title="最後のページ"
							aria-label="最後のページ"
						>
							<Icon name="chevrons-right" class="size-3" />
						</button>
					</div>
				</div>
			</div>
		{/if}
	</main>

	<!-- トースト通知 (DADS Notice Block準拠) -->
	<div
		class="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2 transition-all duration-300"
	>
		{#each toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex items-start gap-2.5 rounded-4 border border-solid-gray-300 bg-white p-3 text-xs text-solid-gray-900 shadow-1 dark:border-solid-gray-700 dark:bg-solid-gray-800 dark:text-white {toast.type ===
				'success'
					? 'border-l-4 border-l-success-1'
					: toast.type === 'error'
						? 'border-l-4 border-l-error-1'
						: toast.type === 'warning'
							? 'border-l-4 border-l-warning-yellow-1'
							: 'border-l-4 border-l-blue-900 dark:border-l-blue-400'}"
			>
				<span class="mt-0.5 shrink-0">
					{#if toast.type === 'success'}
						<Icon name="check" class="size-3.5 text-success-1" />
					{:else if toast.type === 'error'}
						<Icon name="alert-circle" class="size-3.5 text-error-1" />
					{:else if toast.type === 'warning'}
						<Icon name="alert-triangle" class="size-3.5 text-warning-yellow-1" />
					{:else}
						<Icon name="info" class="size-3.5 text-blue-900 dark:text-blue-400" />
					{/if}
				</span>
				<div class="flex-1 leading-snug">{toast.message}</div>
				<button
					type="button"
					onclick={() => removeToast(toast.id)}
					class="shrink-0 cursor-pointer p-0.5 text-solid-gray-420 hover:text-solid-gray-700 dark:text-solid-gray-400 dark:hover:text-solid-gray-200"
					aria-label="閉じる"
				>
					<Icon name="x" class="size-3" />
				</button>
			</div>
		{/each}
	</div>
</div>
