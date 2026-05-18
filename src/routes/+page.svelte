<script>
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Activity, ChevronDown, Plus, BrainCircuit, Download, Loader2 } from 'lucide-svelte';

	// --- State Management ---
	let nodes = [
		{ id: 'node-alpha', name: 'Alpha Pipeline - Sec 1A', location: 'North Field' },
		{ id: 'node-beta', name: 'Beta Pipeline - Sec 2B', location: 'East Valley' },
		{ id: 'node-gamma', name: 'Gamma Station - Main', location: 'Central Hub' }
	];

	let selectedNodeId = nodes[0].id;
	$: selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

	let timespan = '24h';

	let chartCanvas;
	let chartInstance = null;
	let isChartJsLoaded = false;
	let isAddingNode = false;

	let isFetchingData = false;

	// Reactively re-render chart whenever shadcn Tabs or Dropdown values change
	$: if (isChartJsLoaded && (timespan || selectedNodeId)) {
		renderChart();
	}

	// --- Real Data Fetcher ---
	async function fetchRealData(span, node) {
		try {
			isFetchingData = true;
			const response = await fetch(`/api/telemetry?timespan=${span}&node=${node}`);
			if (!response.ok) throw new Error('Failed to fetch data');
			const data = await response.json();
			return data;
		} catch (error) {
			console.error('Error fetching from API:', error);
			// Return empty arrays so the chart doesn't crash on failure
			return { labels: [], busV: [], busI: [], electrodeV: [], predictedV: [], humidity: [] };
		} finally {
			isFetchingData = false;
		}
	}

	// --- Chart Rendering ---
	async function renderChart() {
		if (!isChartJsLoaded || !chartCanvas) return;

		// Fetch real data from our SvelteKit API
		const data = await fetchRealData(timespan, selectedNodeId);

		if (chartInstance) {
			chartInstance.destroy();
		}

		const ctx = chartCanvas.getContext('2d');

		// @ts-ignore
		chartInstance = new Chart(ctx, {
			type: 'line',
			data: {
				labels: data.labels,
				datasets: [
					{
						label: 'Bus Voltage (V)',
						data: data.busV,
						borderColor: '#eab308',
						backgroundColor: 'rgba(234, 179, 8, 0.1)',
						yAxisID: 'yVoltage',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					},
					{
						label: 'Bus Current (A)',
						data: data.busI,
						borderColor: '#ef4444',
						backgroundColor: 'rgba(239, 68, 68, 0.1)',
						yAxisID: 'yCurrent',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					},
					{
						label: 'Target Current (mA)',
						data: data.TbusI,
						borderColor: '#22c55e',
						backgroundColor: 'rgba(34, 197, 94, 0.1)',
						yAxisID: 'yCurrent',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					},
					{
						label: 'Electrode Voltage (V)',
						data: data.electrodeV,
						borderColor: '#3b82f6',
						backgroundColor: 'rgba(59, 130, 246, 0.1)',
						yAxisID: 'yElectrode',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					},
					{
						label: 'AI Predicted Electrode (V)',
						data: data.predictedV,
						borderColor: '#a855f7',
						backgroundColor: 'rgba(168, 85, 247, 0.1)',
						borderDash: [5, 5],
						yAxisID: 'yElectrode',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					},
					{
						label: 'Soil Humidity (%)',
						data: data.humidity,
						borderColor: '#22c55e',
						backgroundColor: 'rgba(34, 197, 94, 0.1)',
						yAxisID: 'yHumidity',
						tension: 0.4,
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 10
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false
				},
				// Adding a gentle animation for when data loads from DB
				animation: { duration: 500 },
				plugins: {
					legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
					tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 8 }
				},
				scales: {
					x: { grid: { display: false } },
					yVoltage: {
						type: 'linear',
						display: true,
						position: 'left',
						title: { display: true, text: 'Bus Voltage (V)', color: '#eab308' },
						grid: { color: 'rgba(0,0,0,0.04)' }
					},
					yCurrent: {
						type: 'linear',
						display: true,
						position: 'right',
						title: { display: true, text: 'Bus Current (A)', color: '#ef4444' },
						grid: { drawOnChartArea: false }
					},
					yElectrode: {
						type: 'linear',
						display: true,
						position: 'left',
						title: { display: true, text: 'Electrode (V)', color: '#3b82f6' },
						grid: { drawOnChartArea: false }
					},
					yHumidity: {
						type: 'linear',
						display: true,
						position: 'right',
						title: { display: true, text: 'Humidity (%)', color: '#22c55e' },
						grid: { drawOnChartArea: false },
						min: 0,
						max: 3
					}
				}
			}
		});
	}

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
		script.onload = () => {
			isChartJsLoaded = true;
			// The reactive statement $: if(isChartJsLoaded) will handle the initial render now
		};
		document.head.appendChild(script);

		return () => {
			if (chartInstance) chartInstance.destroy();
			if (document.head.contains(script)) document.head.removeChild(script);
		};
	});

	function handleAddNode() {
		isAddingNode = true;
		setTimeout(() => {
			alert("This action would trigger the 'Add New ICCP Node' configuration modal or page.");
			isAddingNode = false;
		}, 100);
	}
</script>

<div class="min-h-screen bg-background font-sans text-foreground">
	<!-- STREAMING_CHUNK:Header & Navigation -->
	<header class="sticky top-0 z-30 border-b bg-background shadow-sm">
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
			<!-- Logo & Title -->
			<div class="flex items-center gap-3">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
				>
					<Activity class="h-5 w-5" />
				</div>
				<h1 class="text-xl font-semibold tracking-tight">
					ICCP Sentinel <span class="text-primary">AI</span>
				</h1>
			</div>

			<!-- Node Selection Dropdown (shadcn) -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="gap-2 rounded-full">
							<span class="max-w-[150px] truncate sm:max-w-xs">{selectedNode.name}</span>
							<ChevronDown class="h-4 w-4 text-muted-foreground" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-64">
					<DropdownMenu.Label
						class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
						>Active Nodes</DropdownMenu.Label
					>
					<DropdownMenu.Separator />
					<!-- RadioGroup binds directly to our selectedNodeId state -->
					<DropdownMenu.RadioGroup bind:value={selectedNodeId}>
						{#each nodes as node}
							<DropdownMenu.RadioItem value={node.id} class="cursor-pointer">
								<div class="flex w-full flex-col">
									<span>{node.name}</span>
									<span class="text-xs text-muted-foreground">{node.location}</span>
								</div>
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						class="cursor-pointer font-medium text-primary"
						on:click={handleAddNode}
					>
						<Plus class="mr-2 h-4 w-4" />
						Add New Node...
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<!-- STREAMING_CHUNK:Main Content Area -->
	<main class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header & Timespan Controls -->
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-2xl font-bold">{selectedNode.name}</h2>
				<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
					<span class="relative flex h-2 w-2">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
						></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
					</span>
					Live Data Monitoring • {selectedNode.location}
				</p>
			</div>

			<!-- Timespan Selector (shadcn Tabs) -->
			<Tabs.Root bind:value={timespan} class="w-full sm:w-[300px]">
				<Tabs.List class="grid w-full grid-cols-4">
					<Tabs.Trigger value="1h">1H</Tabs.Trigger>
					<Tabs.Trigger value="24h">24H</Tabs.Trigger>
					<Tabs.Trigger value="7d">7D</Tabs.Trigger>
					<Tabs.Trigger value="30d">30D</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>

		<!-- STREAMING_CHUNK:System Status Cards -->
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
						Bus Voltage
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						24.1 <span class="text-sm font-normal text-muted-foreground">V</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-red-500"></div>
						Bus Current
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						12.4 <span class="text-sm font-normal text-muted-foreground">A</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-blue-500"></div>
						Current Electrode
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						-0.92 <span class="text-sm font-normal text-muted-foreground">V</span>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Custom styled shadcn Card for AI feature -->
			<Card.Root
				class="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-sm"
			>
				<div
					class="absolute top-0 right-0 -mt-6 -mr-6 h-24 w-24 rounded-full bg-white opacity-10 blur-2xl"
				></div>
				<Card.Header class="pb-2 text-purple-100">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-purple-100">
						<BrainCircuit class="h-4 w-4" />
						AI Prediction
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						-0.94 <span class="text-sm font-normal text-purple-200">V (Forecast)</span>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- STREAMING_CHUNK:Chart Card Container -->
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-lg">Telemetry & AI Pipeline Health</Card.Title>
				<Button variant="ghost" size="icon" title="Export Data">
					<Download class="h-5 w-5 text-muted-foreground" />
				</Button>
			</Card.Header>
			<Card.Content>
				<div class="relative mt-4 h-[450px] w-full">
					{#if !isChartJsLoaded || isFetchingData}
						<div
							class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm transition-all"
						>
							<div class="flex flex-col items-center text-muted-foreground">
								<Loader2 class="mb-4 h-8 w-8 animate-spin text-primary" />
								<span class="text-sm font-medium">
									{!isChartJsLoaded ? 'Initializing Charting Engine...' : 'Fetching Live Data...'}
								</span>
							</div>
						</div>
					{/if}
					<canvas bind:this={chartCanvas}></canvas>
				</div>
			</Card.Content>
		</Card.Root>
	</main>
</div>
