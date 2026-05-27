<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	// shadcn-svelte components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let email = '';
	let password = '';
	let errorMessage = '';
	let loading = false;

	async function handleLogin() {
		loading = true;
		errorMessage = '';

		const { data, error } = await authClient.signIn.email({
			email,
			password
		});

		if (error) {
			errorMessage = error.message ?? '';
			loading = false;
		} else {
			goto('/');
		}
	}
</script>

<div class="mx-auto mt-20 max-w-sm space-y-6">
	<h1 class="text-2xl font-bold">Sign In</h1>

	{#if errorMessage}
		<p class="text-sm text-red-500">{errorMessage}</p>
	{/if}

	<form on:submit|preventDefault={handleLogin} class="space-y-4">
		<div class="space-y-2">
			<Label for="email">Email</Label>
			<Input id="email" type="email" bind:value={email} required />
		</div>

		<div class="space-y-2">
			<Label for="password">Password</Label>
			<Input id="password" type="password" bind:value={password} required />
		</div>

		<Button type="submit" class="w-full" disabled={loading}>
			{loading ? 'Signing in...' : 'Sign In'}
		</Button>
	</form>
</div>
