<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.project.title} - Privalytics</title>
	<meta name="description" content={data.project.description} />
</svelte:head>

<div>
	<p><a href={resolve('/')}>All projects</a></p>
	<h1>{data.project.title}</h1>
	<p>{data.project.description}</p>

	<h2>Users</h2>
	<div>
		<p>All-time users: {data.summary.totalEntityCount}</p>
		<p>Active in the last 30 days: {data.summary.activeEntityCount}</p>
	</div>

	<section>
		{#if data.summary.dailyActivity.length === 0}
			<p>no activity lol</p>
		{:else}
			<table>
				<thead>
					<tr><th scope="col">UTC date</th><th scope="col">Unique users</th></tr>
				</thead>
				<tbody>
					{#each data.summary.dailyActivity as day (day.date)}
						<tr>
							<td>{day.date}</td>
							<td>{day.entityCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section>
		<h2>The data</h2>
		{#each data.summary.fields as field (field.key)}
			<section>
				<h3>{field.label}</h3>
				{#if field.distribution.length === 0}
					<p>no data available</p>
				{:else}
					<table>
						<thead>
							<tr><th scope="col">Value</th><th scope="col">users</th></tr>
						</thead>
						<tbody>
							{#each field.distribution as item (String(item.value))}
								<tr>
									<td>{item.label}</td>
									<td>{item.count}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/each}
	</section>
</div>
