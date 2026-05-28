<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { ActionData, PageData } from './$types';

	// shadcn-svelte UI components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	// Icons
	import { AlertTriangle, Activity, Trash2, Cpu, Plus, ArrowLeft } from 'lucide-svelte';

	// Svelte 5 runes for reading server-side load and action responses
	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	// Local state to keep track of the selected node to form-bind easily
	let selectedId = $state('');
</script>

<div class="container mx-auto max-w-6xl space-y-8 px-4 py-10">
	<!-- Header Section -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-left text-3xl font-bold tracking-tight">ICCP Node Registry</h1>
			<p class="text-sm text-muted-foreground">
				Map telemetry data streams from InfluxDB into registered Cathodic Protection nodes.
			</p>
		</div>
		<Button href="/" variant="outline" class="gap-2 self-start sm:self-auto">
			<ArrowLeft class="h-4 w-4" />
			Dashboard Home
		</Button>
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<!-- Left Column: Add Node Form (Dynamic InfluxDB Dropdown) -->
		<div class="space-y-6 lg:col-span-1">
			<Card.Root>
				<Card.Header>
					<Card.Title>Map Unregistered Node</Card.Title>
					<Card.Description>
						Register an active InfluxDB device ID to initialize monitoring.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form
						method="POST"
						action="?/createNode"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success('ICCP node registered successfully!');
									selectedId = ''; // Reset selected ID
								} else if (result.type === 'failure') {
									toast.error(result.data?.error || 'Failed to register node.');
								}
								update();
							};
						}}
						class="space-y-4"
					>
						<!-- Dropdown Selection for Available InfluxDB Device IDs -->
						<div class="space-y-2">
							<Label for="id">Available InfluxDB Device ID</Label>

							{#if data.availableDeviceIds && data.availableDeviceIds.length > 0}
								<select
									id="id"
									name="id"
									bind:value={selectedId}
									required
									class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
								>
									<option value="" disabled>Select an available device ID...</option>
									{#each data.availableDeviceIds as deviceId}
										<option value={deviceId}>{deviceId}</option>
									{/each}
								</select>
								<p class="text-[11px] text-muted-foreground">
									Showing devices currently broadcasting to the telemetry server.
								</p>
							{:else}
								<div
									class="space-y-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-400"
								>
									<div class="flex items-center gap-1.5 font-semibold">
										<AlertTriangle class="h-3.5 w-3.5" />
										No Unregistered Devices Found
									</div>
									<p class="leading-relaxed text-muted-foreground">
										All active InfluxDB telemetry streams have already been mapped, or no devices
										are transmitting data.
									</p>
								</div>
								<!-- Hidden element to satisfy Svelte accessibility checks/fallback -->
								<input type="hidden" name="id" value="" />
							{/if}
						</div>

						<!-- Node Name -->
						<div class="space-y-2">
							<Label for="name">Friendly Name</Label>
							<Input
								type="text"
								id="name"
								name="name"
								placeholder="e.g. Zone 3 Cathodic Bed"
								required
							/>
						</div>

						<!-- Description -->
						<div class="space-y-2">
							<Label for="description">
								Location & Description <span class="font-normal text-muted-foreground"
									>(Optional)</span
								>
							</Label>
							<textarea
								id="description"
								name="description"
								placeholder="Describe the physical installation, coordinates, or anode type..."
								rows="3"
								class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							></textarea>
						</div>

						<Button
							type="submit"
							class="w-full gap-2"
							disabled={!data.availableDeviceIds || data.availableDeviceIds.length === 0}
						>
							<Plus class="h-4 w-4" />
							Register ICCP Node
						</Button>
					</form>
				</Card.Content>
			</Card.Root>

			<!-- Feedback Alerts from server actions -->
			{#if form?.error}
				<Alert.Root variant="destructive">
					<AlertTriangle class="h-4 w-4" />
					<Alert.Title>Operation Failed</Alert.Title>
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>

		<!-- Right Column: Registered Nodes List Table -->
		<div class="lg:col-span-2">
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<div>
							<Card.Title>Mapped ICCP Nodes</Card.Title>
							<Card.Description
								>A listing of all active registered cathodic protection systems.</Card.Description
							>
						</div>
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
						>
							<Activity class="h-3 w-3 animate-pulse" />
							{data.nodes.length} Registered
						</span>
					</div>
				</Card.Header>
				<Card.Content>
					<div class="rounded-md border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Node ID & Name</Table.Head>
									<Table.Head>Description</Table.Head>
									<Table.Head class="text-right">Registered Date</Table.Head>
									<Table.Head class="text-right">Action</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.nodes as node}
									<Table.Row>
										<!-- Node ID & Friendly Name -->
										<Table.Cell>
											<div class="flex flex-col gap-1">
												<span class="leading-none font-semibold text-foreground">{node.name}</span>
												<code
													class="max-w-max rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground select-all"
												>
													{node.id}
												</code>
											</div>
										</Table.Cell>

										<!-- Description -->
										<Table.Cell class="max-w-[240px] truncate text-sm text-muted-foreground">
											{node.description || '—'}
										</Table.Cell>

										<!-- Creation Date -->
										<Table.Cell class="text-right text-sm whitespace-nowrap text-muted-foreground">
											{new Date(node.createdAt).toLocaleDateString()}
										</Table.Cell>

										<!-- Delete Action with Svelte 5 compliant Dialog Snippets -->
										<Table.Cell class="text-right">
											<div class="flex justify-end gap-1">
												<AlertDialog.Root>
													<AlertDialog.Trigger>
														{#snippet child({ props })}
															<Button
																{...props}
																variant="ghost"
																size="icon"
																title="Decommission Node"
															>
																<Trash2
																	class="h-4 w-4 text-destructive opacity-80 hover:opacity-100"
																/>
																<span class="sr-only">Delete</span>
															</Button>
														{/snippet}
													</AlertDialog.Trigger>
													<AlertDialog.Content>
														<AlertDialog.Header>
															<AlertDialog.Title>Decommission ICCP Node?</AlertDialog.Title>
															<AlertDialog.Description>
																Are you sure you want to delete node <strong>{node.name}</strong>
																(<code class="font-mono text-xs">{node.id}</code>)? This will remove
																it from the dashboard, but the historical data will remain untouched
																inside InfluxDB.
															</AlertDialog.Description>
														</AlertDialog.Header>
														<AlertDialog.Footer>
															<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>

															<form
																method="POST"
																action="?/deleteNode"
																use:enhance={() => {
																	return async ({ result, update }) => {
																		if (result.type === 'success') {
																			toast.success('ICCP node decommissioned.');
																		} else if (result.type === 'failure') {
																			toast.error(result.data?.error || 'Failed to remove node.');
																		}
																		update();
																	};
																}}
															>
																<input type="hidden" name="id" value={node.id} />
																<AlertDialog.Action
																	type="submit"
																	class="bg-destructive text-white hover:bg-destructive/90"
																>
																	Decommission
																</AlertDialog.Action>
															</form>
														</AlertDialog.Footer>
													</AlertDialog.Content>
												</AlertDialog.Root>
											</div>
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell colspan={4} class="text-center py-12 text-muted-foreground">
											<div class="flex flex-col items-center justify-center gap-3">
												<Cpu class="h-8 w-8 text-muted-foreground/40" />
												<div class="space-y-1">
													<p class="font-medium text-foreground">No ICCP Nodes Registered</p>
													<p class="text-xs">
														Map an active InfluxDB stream on the left to start telemetry tracking.
													</p>
												</div>
											</div>
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
