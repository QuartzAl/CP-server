<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	// shadcn-svelte components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { AlertCircle, LockKeyhole } from 'lucide-svelte';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<div class="w-full max-w-md space-y-4">
		<Alert.Root
			variant="default"
			class="border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400"
		>
			<LockKeyhole class="h-4 w-4 stroke-blue-600 dark:stroke-blue-400" />
			<Alert.Title>Welcome, {data.user.name || 'User'}!</Alert.Title>
			<Alert.Description>
				Because this is your first time signing in, you are required to change your temporary
				password to continue.
			</Alert.Description>
		</Alert.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Change Password</Card.Title>
				<Card.Description>Please secure your account with a new password.</Card.Description>
			</Card.Header>

			<Card.Content>
				{#if form?.error}
					<Alert.Root variant="destructive" class="mb-6">
						<AlertCircle class="h-4 w-4" />
						<Alert.Title>Error</Alert.Title>
						<Alert.Description>{form.error}</Alert.Description>
					</Alert.Root>
				{/if}

				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							update();
						};
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="currentPassword">Current Temporary Password</Label>
						<Input
							type="password"
							id="currentPassword"
							name="currentPassword"
							required
							placeholder="••••••••••••"
						/>
					</div>

					<div class="space-y-2">
						<Label for="newPassword">New Password</Label>
						<Input
							type="password"
							id="newPassword"
							name="newPassword"
							required
							minlength="8"
							placeholder="Minimum 8 characters"
						/>
					</div>

					<div class="space-y-2">
						<Label for="confirmPassword">Confirm New Password</Label>
						<Input type="password" id="confirmPassword" name="confirmPassword" required />
					</div>

					<Button type="submit" class="mt-4 w-full" disabled={loading}>
						{loading ? 'Updating Password...' : 'Update Password & Continue'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
