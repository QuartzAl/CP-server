<script lang="ts">
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<div class="app">
	<!-- <Header /> -->

	<main>
		{@render children()}
	</main>

	<footer>
		<p>
			<!-- visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to learn about SvelteKit -->
		</p>
	</footer>
	<Toaster position="bottom-right" richColors />
</div>
