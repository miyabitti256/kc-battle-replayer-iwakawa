<script lang="ts">
	import { onMount } from 'svelte';
	import LZString from 'lz-string';
	import { convertBattleLogToReplay, parseLogFilename, type BattleLogItem } from '$lib/index.js';

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
	let isDark = $state(false);

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

				allLogs = items;
				currentPage = 1;
				addToast(`${items.length.toLocaleString()} 件の戦闘ログをインデックス化しました`, 'info');
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
					id: `${file.name}_${i}`,
					filename: file.name,
					file,
					...parsed
				});
			}
		}

		allLogs = items;
		currentPage = 1;
		isLoading = false;
		addToast(`${items.length.toLocaleString()} 件の戦闘ログをインデックス化しました`, 'info');
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

	async function getLogContent(item: BattleLogItem): Promise<string> {
		if (item.handle) {
			const file = await item.handle.getFile();
			return await file.text();
		}
		if (item.file) {
			return await item.file.text();
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
			addToast('リプレイJSONをクリップボードにコピーしました', 'success');
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
			const baseName = item.filename.replace(/\.[^.]+$/, '');
			a.download = `${baseName}.replay.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			addToast(`${baseName}.replay.json を保存しました`, 'success');
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

<div
	class="flex min-h-screen flex-col bg-zinc-50 font-sans text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
>
	<!-- ヘッダー -->
	<header
		class="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-2.5 shadow-xs backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/95"
	>
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<h1 class="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					艦これ バトルリプレイヤー（岩川版）
				</h1>
				{#if allLogs.length > 0}
					<span
						class="rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
					>
						{allLogs.length.toLocaleString()} 件
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<!-- フォールバック用隠しインプット -->
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
					onclick={selectDirectory}
					disabled={isLoading}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:active:bg-zinc-800"
				>
					<span>📁</span>
					<span>{isLoading ? '走査中...' : 'フォルダ選択'}</span>
				</button>

				{#if allLogs.length > 0}
					<!-- 検索入力部: 海域 / 番号 / マス -->
					<div class="flex items-center gap-1">
						<input
							type="text"
							placeholder="海域 (62)"
							bind:value={searchWorld}
							oninput={() => (currentPage = 1)}
							class="w-18 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 placeholder-zinc-400 transition focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-400"
							title="海域で絞り込み (例: 62, 5, E2)"
						/>
						<span class="text-xs text-zinc-400 dark:text-zinc-500">-</span>
						<input
							type="text"
							placeholder="番号 (3)"
							bind:value={searchMap}
							oninput={() => (currentPage = 1)}
							class="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 placeholder-zinc-400 transition focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-400"
							title="マップ番号で絞り込み (例: 3, 5)"
						/>
						<span class="text-xs text-zinc-400 dark:text-zinc-500">/</span>
						<input
							type="text"
							placeholder="マス (62)"
							bind:value={searchCell}
							oninput={() => (currentPage = 1)}
							class="w-18 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 placeholder-zinc-400 transition focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-400"
							title="マス(セル)で絞り込み (例: 62, boss)"
						/>
						<button
							type="button"
							onclick={clearSearch}
							disabled={!isFiltering}
							class="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:opacity-30"
							title="検索条件をクリア"
						>
							クリア
						</button>
					</div>

					<button
						type="button"
						onclick={toggleSortOrder}
						class="inline-flex cursor-pointer items-center rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
						title="ソート順の切り替え"
					>
						<span>{sortOrder === 'desc' ? '▼ 最新順' : '▲ 古い順'}</span>
					</button>
				{/if}

				<!-- テーマ切り替えボタン -->
				<button
					type="button"
					onclick={toggleTheme}
					class="inline-flex cursor-pointer items-center justify-center rounded border border-zinc-300 bg-white p-1.5 text-xs text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
					title={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
					aria-label="テーマ切り替え"
				>
					<span>{isDark ? '☀️ ライト' : '🌙 ダーク'}</span>
				</button>
			</div>
		</div>
	</header>

	<!-- メインコンテンツ -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 sm:p-6">
		{#if allLogs.length === 0}
			<div
				class="my-auto flex flex-col items-center justify-center rounded border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900"
			>
				<h2 class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
					戦闘ログフォルダを選択してください
				</h2>
				<p class="mt-1.5 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
					ファイル名からインデックスを作成するため、大量のファイルがあっても高速に動作します。
				</p>
				<button
					type="button"
					onclick={selectDirectory}
					disabled={isLoading}
					class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
				>
					<span>📁</span>
					<span>{isLoading ? '読み込み中...' : 'フォルダを選択する'}</span>
				</button>
			</div>
		{:else if filteredLogs.length === 0}
			<div
				class="my-16 flex flex-col items-center justify-center rounded border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
			>
				<p class="text-xs">条件に一致する戦闘ログが見つかりませんでした。</p>
				<button
					type="button"
					onclick={clearSearch}
					class="mt-2 cursor-pointer text-xs text-blue-600 underline hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
				>
					検索条件をクリア
				</button>
			</div>
		{:else}
			<!-- シンプルなデータテーブル -->
			<div
				class="flex-1 overflow-hidden rounded border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
			>
				<div class="overflow-x-auto">
					<table class="w-full table-fixed border-collapse text-left text-xs">
						<thead>
							<tr
								class="border-b border-zinc-200 bg-zinc-100 font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-400"
							>
								<th class="w-40 px-3 py-2">日時</th>
								<th class="w-20 px-3 py-2">海域</th>
								<th class="w-16 px-3 py-2">番号</th>
								<th class="w-20 px-3 py-2">マス</th>
								<th class="px-3 py-2">ファイル名</th>
								<th class="w-44 px-3 py-2 text-right">操作</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-200 dark:divide-zinc-800/60">
							{#each paginatedLogs as item (item.id)}
								<tr class="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-zinc-700 dark:text-zinc-300"
									>
										{item.dateTimeStr}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-zinc-700 dark:text-zinc-300"
									>
										{#if item.isPractice}
											<span
												class="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
											>
												演習
											</span>
										{:else}
											{item.world}
										{/if}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-zinc-700 dark:text-zinc-300"
									>
										{item.map}
									</td>
									<td
										class="px-3 py-2 font-mono whitespace-nowrap text-zinc-700 dark:text-zinc-300"
									>
										{item.cell}
									</td>
									<td
										class="truncate px-3 py-2 font-mono text-zinc-500 dark:text-zinc-400"
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
												class="inline-flex cursor-pointer items-center gap-1 rounded border border-blue-600 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 active:bg-blue-200 disabled:opacity-40 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
												title="KC3Kaiリプレイヤーで自動再生"
											>
												<span class="text-blue-600 dark:text-blue-400">▶</span>
												<span>再生</span>
											</button>
											<button
												type="button"
												onclick={() => handleCopy(item)}
												disabled={actionLoadingId === item.id}
												class="inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
												title="リプレイJSONをクリップボードにコピー"
											>
												<span>📋</span>
												<span>コピー</span>
											</button>
											<button
												type="button"
												onclick={() => handleDownload(item)}
												disabled={actionLoadingId === item.id}
												class="inline-flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded border border-zinc-300 bg-white text-xs text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
												title=".replay.json を保存"
											>
												💾
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- ページ送りフッター -->
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400"
				>
					<div>
						<span>
							全 {filteredLogs.length.toLocaleString()} 件中
							{((currentPage - 1) * pageSize + 1).toLocaleString()} 〜
							{Math.min(currentPage * pageSize, filteredLogs.length).toLocaleString()} 件目を表示
						</span>
					</div>

					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={() => (currentPage = 1)}
							disabled={currentPage <= 1}
							class="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
							title="最初のページ"
						>
							«
						</button>
						<button
							type="button"
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage <= 1}
							class="rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
						>
							‹ 前へ
						</button>
						<span class="px-2 font-mono text-zinc-700 dark:text-zinc-300">
							{currentPage} / {totalPages}
						</span>
						<button
							type="button"
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage >= totalPages}
							class="rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
						>
							次へ ›
						</button>
						<button
							type="button"
							onclick={() => (currentPage = totalPages)}
							disabled={currentPage >= totalPages}
							class="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
							title="最後のページ"
						>
							»
						</button>
					</div>
				</div>
			</div>
		{/if}
	</main>

	<!-- トースト通知 -->
	<div
		class="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2 transition-all duration-300"
	>
		{#each toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex items-start gap-2 rounded border border-zinc-300 bg-white p-3 text-xs text-zinc-800 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
			>
				<span class="shrink-0">
					{#if toast.type === 'success'}
						<span class="text-zinc-700 dark:text-zinc-300">✓</span>
					{:else if toast.type === 'error'}
						<span class="text-red-500">⚠</span>
					{:else if toast.type === 'warning'}
						<span class="text-amber-500">⚡</span>
					{:else}
						<span class="text-blue-500">ℹ</span>
					{/if}
				</span>
				<div class="flex-1 leading-snug">{toast.message}</div>
				<button
					type="button"
					onclick={() => removeToast(toast.id)}
					class="shrink-0 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
				>
					✕
				</button>
			</div>
		{/each}
	</div>
</div>
