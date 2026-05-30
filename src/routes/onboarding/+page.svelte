<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { ActionData } from './$types';

	// shadcn-svelte UI components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';

	// Icons
	import { ShieldCheck, AlertCircle, Eye, EyeOff, LockOpen, ArrowRight } from 'lucide-svelte';

	// Svelte 5 reactive action data bindings
	let { form } = $props<{ form: ActionData }>();

	// Svelte 5 Local states
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let isSubmitting = $state(false);

	// Reactive Svelte 5 derived calculations
	let passwordsMatch = $derived(password === confirmPassword);
	let isPasswordStrong = $derived(password.length >= 8);
	let canSubmit = $derived(
		name.trim() !== '' && email.includes('@') && isPasswordStrong && passwordsMatch && !isSubmitting
	);
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12 sm:px-6 lg:px-8">
	<div class="w-full max-w-md space-y-8">
		<!-- Central Logo & Subtitle Info -->
		<div class="flex flex-col items-center space-y-2 text-center">
			<div class="rounded-full bg-primary/10 p-3 text-primary ring-8 ring-primary/5">
				<ShieldCheck class="h-8 w-8" />
			</div>
			<h2 class="text-3xl font-extrabold tracking-tight text-foreground">Initialize System</h2>
			<p class="max-w-xs text-sm text-muted-foreground">
				No administrator accounts found. Establish your master credentials to configure the
				platform.
			</p>
		</div>

		<Card.Root class="border-primary/20 bg-card shadow-lg">
			<Card.Header class="space-y-1">
				<Card.Title class="text-xl">Create Administrator</Card.Title>
				<Card.Description>
					This account will have complete read, write, and security privileges.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ result, update }) => {
							isSubmitting = false;
							if (result.type === 'failure') {
								toast.error(result.data?.error || 'Registration failed.');
							}
							update();
						};
					}}
					class="space-y-4"
				>
					<!-- Full Name Input -->
					<div class="space-y-1.5">
						<Label for="name">Administrative Name</Label>
						<Input
							type="text"
							id="name"
							name="name"
							placeholder="e.g. System Administrator"
							bind:value={name}
							required
							disabled={isSubmitting}
						/>
					</div>

					<!-- Email Input -->
					<div class="space-y-1.5">
						<Label for="email">Email Address</Label>
						<Input
							type="email"
							id="email"
							name="email"
							placeholder="admin@system.com"
							bind:value={email}
							required
							disabled={isSubmitting}
						/>
					</div>

					<!-- Password Input -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<Label for="password">Security Password</Label>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
								tabindex="-1"
							>
								{#if showPassword}
									<EyeOff class="h-3.5 w-3.5" /> Hide
								{:else}
									<Eye class="h-3.5 w-3.5" /> Show
								{/if}
							</button>
						</div>
						<Input
							type={showPassword ? 'text' : 'password'}
							id="password"
							name="password"
							placeholder="••••••••"
							bind:value={password}
							required
							disabled={isSubmitting}
						/>

						<!-- Password strength feedback -->
						{#if password.length > 0}
							<div class="mt-1 flex items-center gap-1.5">
								<span
									class="text-[11px] {isPasswordStrong
										? 'text-green-500'
										: 'text-amber-500'} font-medium"
								>
									{isPasswordStrong ? '✓ Safe Length' : '✗ Must be at least 8 characters long'}
								</span>
							</div>
						{/if}
					</div>

					<!-- Confirm Password Input -->
					<div class="space-y-1.5">
						<Label for="confirmPassword">Verify Password</Label>
						<Input
							type="password"
							id="confirmPassword"
							name="confirmPassword"
							placeholder="••••••••"
							bind:value={confirmPassword}
							required
							disabled={isSubmitting}
						/>

						<!-- Password mismatch alert -->
						{#if confirmPassword.length > 0}
							<p
								class="text-[11px] {passwordsMatch
									? 'text-green-500'
									: 'text-destructive'} mt-1 font-medium"
							>
								{passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
							</p>
						{/if}
					</div>

					<!-- Error Messages from Server Actions -->
					{#if form?.error}
						<Alert.Root variant="destructive" class="py-2.5">
							<AlertCircle class="h-4 w-4" />
							<Alert.Title class="text-xs font-semibold">Setup Blocked</Alert.Title>
							<Alert.Description class="text-[11px] leading-relaxed">
								{form.error}
							</Alert.Description>
						</Alert.Root>
					{/if}

					<!-- Action Submit -->
					<Button type="submit" class="mt-2 w-full gap-2" disabled={!canSubmit}>
						{#if isSubmitting}
							Configuring Cluster...
						{:else}
							Configure & Initialize System
							<ArrowRight class="h-4 w-4" />
						{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-center text-xs text-muted-foreground select-none">
			This dashboard utilizes hardware-enforced authorization bounds.
		</p>
	</div>
</div>
