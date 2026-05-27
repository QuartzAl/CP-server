<script lang="ts">
	import { page } from '$app/state';
	import type { ActionData, PageData } from './$types';
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	// shadcn-svelte UI components
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';

	// Icons (Added Home, Trash2, and UserCog)
	import { AlertCircle, CheckCircle2, Copy, Home, Trash2, UserCog } from 'lucide-svelte';

	export let data: PageData;
	export let form: ActionData;
	let loading = false;

	async function handleRoleChange(userId: string, newRole: string) {
		// DEBUG 1: Did the dropdown actually detect the click?
		console.log('1. Dropdown changed! User:', userId, 'New Role:', newRole);

		const formData = new FormData();
		formData.append('userId', userId);
		formData.append('role', newRole);

		try {
			console.log('2. Sending fetch request to server...');

			const response = await fetch('?/changeRole', {
				method: 'POST',
				body: formData,
				headers: {
					// THIS IS MANDATORY FOR SVELTEKIT ACTIONS!
					'x-sveltekit-action': 'true'
				}
			});

			// DEBUG 2: Did the server respond?
			console.log('3. Server responded with status:', response.status);

			const result = deserialize(await response.text());
			console.log('4. Parsed SvelteKit Result:', result);

			if (result.type === 'success') {
				toast.success('User role updated successfully.');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(result.data?.error || 'Failed to update role.');
			}
		} catch (error) {
			console.error('Fetch completely failed:', error);
			toast.error('A network error occurred.');
		}
	}
	// Helper for copying password to clipboard
	let copied = false;
	function copyPassword(password: string) {
		navigator.clipboard.writeText(password);
		toast.success('Copied to clipboard!');
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="container mx-auto max-w-6xl space-y-8 py-10">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
		</div>
		<Button href="/" variant="outline" class="gap-2">
			<Home class="h-4 w-4 text-primary" />
			<span class="text-primary">Back to Home</span>
		</Button>
	</div>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
		<div class="space-y-6 md:col-span-1">
			<Card.Root>
				<Card.Header>
					<Card.Title>Add New User</Card.Title>
					<Card.Description>
						Create an account. A temporary password will be generated.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="POST" action="?/createUser" use:enhance class="space-y-4">
						<div class="space-y-2">
							<Label for="email">User Email</Label>
							<Input type="email" id="email" name="email" placeholder="user@example.com" required />
						</div>
						<div class="mt-4 space-y-2">
							<Label for="role">User Role</Label>
							<select
								name="role"
								id="role"
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							>
								<option value="user">Regular User</option>
								<option value="admin">Administrator</option>
							</select>
						</div>
						<Button type="submit" class="w-full">Create User</Button>
					</form>
				</Card.Content>
			</Card.Root>

			{#if form?.success && form.generatedPassword}
				<Alert.Root
					variant="default"
					class="border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
				>
					<CheckCircle2 class="h-4 w-4 stroke-green-600 dark:stroke-green-400" />
					<Alert.Title>User Created Successfully</Alert.Title>
					<Alert.Description class="mt-2 space-y-2">
						<p>Share this temporary password with <strong>{form.email}</strong>.</p>
						<div class="mt-2 flex items-center gap-2 rounded-md border bg-background/50 p-2">
							<code class="flex-1 font-mono text-foreground">{form.generatedPassword}</code>
							<Button
								variant="outline"
								onclick={() => {
									copyPassword(form.generatedPassword);
								}}><Copy /></Button
							>
						</div>
						<!-- {#if copied} -->
						<!-- 	<p class="text-xs font-medium">Copied to clipboard!</p> -->
						<!-- {/if} -->
					</Alert.Description>
				</Alert.Root>
			{/if}

			{#if form?.error}
				<Alert.Root variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>

		<div class="md:col-span-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Users</Card.Title>
					<Card.Description>A list of all users registered in the system.</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="rounded-md border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Email</Table.Head>
									<Table.Head>Role</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head class="text-right">Joined</Table.Head>
									<Table.Head class="text-right">Actions</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.users as user}
									<Table.Row>
										<Table.Cell class="font-medium">
											{user.email}
										</Table.Cell>

										<Table.Cell>
											{#if page.data.user.email === user.email}
												<span>admin</span>
											{:else}
												<form
													method="POST"
													action="?/changeRole"
													use:enhance={() => {
														return async ({ result, update }) => {
															if (result.type === 'success') {
																toast.success('User role updated successfully.');
															} else if (result.type === 'failure') {
																toast.error(result.data?.error || 'Failed to update role.');
															}
															update();
														};
													}}
													class="flex items-center gap-2"
												>
													<input type="hidden" name="userId" value={user.id} />

													<select
														name="role"
														class="h-8 w-24 cursor-pointer rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
														on:change={(e) => {
															// Safely find the form and submit it
															const form = e.currentTarget.closest('form');
															if (form) form.requestSubmit();
														}}
													>
														<option value="user" selected={user.role !== 'admin'}>User</option>
														<option value="admin" selected={user.role === 'admin'}>Admin</option>
													</select>

													<!-- <Button type="submit" size="sm" variant="secondary" class="h-8 px-2 text-xs" -->
													<!-- 	>Save</Button -->
													<!-- > -->
												</form>
											{/if}
										</Table.Cell>

										<Table.Cell>
											{#if user.requiresPasswordChange}
												<Badge
													variant="outline"
													class="border-amber-500/30 bg-amber-500/10 text-amber-500"
												>
													Pending Reset
												</Badge>
											{:else}
												<Badge
													variant="outline"
													class="border-green-500/30 bg-green-500/10 text-green-500"
												>
													Active
												</Badge>
											{/if}
										</Table.Cell>

										<Table.Cell class="text-right text-sm text-muted-foreground">
											{new Date(user.createdAt).toLocaleDateString()}
										</Table.Cell>

										<Table.Cell class="text-right">
											<div class="flex justify-end gap-1">
												{#if page.data.user.email !== user.email}
													<AlertDialog.Root>
														<AlertDialog.Trigger>
															<Button type="button" variant="ghost" size="icon" title="Delete User">
																<Trash2
																	size="icon"
																	class="h-4 w-4 text-destructive opacity-80 hover:opacity-100"
																/>
																<span class="sr-only">Delete User</span>
															</Button>
														</AlertDialog.Trigger>
														<AlertDialog.Content>
															<AlertDialog.Header>
																<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
																<AlertDialog.Description>
																	This action cannot be undone. This will permanently delete the
																	account data and remove the data from our servers.
																</AlertDialog.Description>
															</AlertDialog.Header>
															<AlertDialog.Footer>
																<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
																<form
																	method="POST"
																	action="?/deleteUser"
																	use:enhance={() => {
																		return async ({ result, update }) => {
																			if (result.type === 'success') {
																				toast.success('User deleted permanently.');
																			} else if (result.type === 'failure') {
																				toast.error(result.data?.error || 'Failed to delete user.');
																			}
																			update();
																		};
																	}}
																>
																	<input type="hidden" name="userId" value={user.id} />
																	<AlertDialog.Action
																		type="submit"
																		class="!text-destructive-foreground bg-destructive hover:bg-destructive/90"
																	>
																		Delete
																	</AlertDialog.Action>
																</form>
															</AlertDialog.Footer>
														</AlertDialog.Content>
													</AlertDialog.Root>
												{:else}
													<Button disabled variant="ghost" size="icon" title="Delete User">
														<Trash2 class="h-4 w-4 opacity-80 hover:opacity-100" />
														<span class="sr-only">Delete User</span>
													</Button>
												{/if}
											</div>
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell colspan={5} class="text-center py-6 text-muted-foreground">
											No users found.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
