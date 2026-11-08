<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Privalytics</title>
	<meta name="description" content="Project analytics summaries." />
</svelte:head>

<div>
	<h1>Privalytics</h1>
	<p>something something all projects</p>

	<h2>Projects</h2>
	{#if data.projects.length === 0}
		<p>no projects lol</p>
	{:else}
		<ul>
			{#each data.projects as project (project.slug)}
				<li>
					<h3>
						<a href={resolve('/projects/[slug]', { slug: project.slug })}>{project.title}</a>
					</h3>
					<p>{project.description}</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>
