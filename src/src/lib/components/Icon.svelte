<script lang="ts">
	// Why not external icon library: Self-contained zero-dependency SVG avoids package weight and ensures consistent stroke styling.
	type IconName =
		| 'folder'
		| 'folder-open'
		| 'play'
		| 'copy'
		| 'download'
		| 'sun'
		| 'moon'
		| 'arrow-up'
		| 'arrow-down'
		| 'arrow-up-down'
		| 'search'
		| 'x'
		| 'chevron-left'
		| 'chevron-right'
		| 'chevrons-left'
		| 'chevrons-right'
		| 'check'
		| 'alert-triangle'
		| 'alert-circle'
		| 'info';

	interface Props {
		name: IconName;
		class?: string;
		size?: number;
	}

	let { name, class: className = 'size-3.5', size = 14 }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	{#if name === 'folder'}
		<path
			d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
		/>
	{:else if name === 'folder-open'}
		<path
			d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"
		/>
	{:else if name === 'play'}
		<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="currentColor" />
	{:else if name === 'copy'}
		<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
		<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
	{:else if name === 'download'}
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<polyline points="7 10 12 15 17 10" />
		<line x1="12" x2="12" y1="15" y2="3" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2" />
		<path d="M12 20v2" />
		<path d="m4.93 4.93 1.41 1.41" />
		<path d="m17.66 17.66 1.41 1.41" />
		<path d="M2 12h2" />
		<path d="M20 12h2" />
		<path d="m6.34 17.66-1.41 1.41" />
		<path d="m19.07 4.93-1.41 1.41" />
	{:else if name === 'moon'}
		<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
	{:else if name === 'arrow-up'}
		<path d="m5 12 7-7 7 7" />
		<path d="M12 19V5" />
	{:else if name === 'arrow-down'}
		<path d="M12 5v14" />
		<path d="m19 12-7 7-7-7" />
	{:else if name === 'arrow-up-down'}
		<path d="m7 15 5 5 5-5" />
		<path d="m7 9 5-5 5 5" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	{:else if name === 'x'}
		<path d="M18 6 6 18" />
		<path d="m6 6 12 12" />
	{:else if name === 'chevron-left'}
		<path d="m15 18-6-6 6-6" />
	{:else if name === 'chevron-right'}
		<path d="m9 18 6-6-6-6" />
	{:else if name === 'chevrons-left'}
		<path d="m11 17-5-5 5-5" />
		<path d="m18 17-5-5 5-5" />
	{:else if name === 'chevrons-right'}
		<path d="m6 17 5-5-5-5" />
		<path d="m13 17 5-5-5-5" />
	{:else if name === 'check'}
		<path d="M20 6 9 17l-5-5" />
	{:else if name === 'alert-triangle'}
		<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<line x1="12" y1="17" x2="12.01" y2="17" />
	{:else if name === 'alert-circle'}
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="8" x2="12" y2="12" />
		<line x1="12" y1="16" x2="12.01" y2="16" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="16" x2="12" y2="12" />
		<line x1="12" y1="8" x2="12.01" y2="8" />
	{/if}
</svg>
