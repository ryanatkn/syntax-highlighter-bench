<!-- stress: logic blocks, elements, and expressions in attributes nested deep -->
<script lang="ts">
	const { items, depth = 0 }: { items: Array<{ id: number; children: Array<number> }>; depth?: number } = $props();
	let open = $state(true);
</script>

{#if open && depth > 0}
	<div class="l0 {open ? 'open' : ''}" data-d={0 + depth} onclick={() => (open = !open)}>
	{#each items as item_1 (item_1.id)}
		<div class="l1 {open ? 'open' : ''}" data-d={1 + depth} onclick={() => (open = !open)}>
		{#await Promise.resolve(2) then v2}
			<div class="l2 {open ? 'open' : ''}" data-d={2 + depth} onclick={() => (open = !open)}>
			{#if open && depth > 3}
				<div class="l3 {open ? 'open' : ''}" data-d={3 + depth} onclick={() => (open = !open)}>
				{#each items as item_4 (item_4.id)}
					<div class="l4 {open ? 'open' : ''}" data-d={4 + depth} onclick={() => (open = !open)}>
					{#await Promise.resolve(5) then v5}
						<div class="l5 {open ? 'open' : ''}" data-d={5 + depth} onclick={() => (open = !open)}>
						{#if open && depth > 6}
							<div class="l6 {open ? 'open' : ''}" data-d={6 + depth} onclick={() => (open = !open)}>
							{#each items as item_7 (item_7.id)}
								<div class="l7 {open ? 'open' : ''}" data-d={7 + depth} onclick={() => (open = !open)}>
								{#await Promise.resolve(8) then v8}
									<div class="l8 {open ? 'open' : ''}" data-d={8 + depth} onclick={() => (open = !open)}>
									{#if open && depth > 9}
										<div class="l9 {open ? 'open' : ''}" data-d={9 + depth} onclick={() => (open = !open)}>
										{#each items as item_10 (item_10.id)}
											<div class="l10 {open ? 'open' : ''}" data-d={10 + depth} onclick={() => (open = !open)}>
											{#await Promise.resolve(11) then v11}
												<div class="l11 {open ? 'open' : ''}" data-d={11 + depth} onclick={() => (open = !open)}>
												{#if open && depth > 12}
													<div class="l12 {open ? 'open' : ''}" data-d={12 + depth} onclick={() => (open = !open)}>
													{#each items as item_13 (item_13.id)}
														<div class="l13 {open ? 'open' : ''}" data-d={13 + depth} onclick={() => (open = !open)}>
														{#await Promise.resolve(14) then v14}
															<div class="l14 {open ? 'open' : ''}" data-d={14 + depth} onclick={() => (open = !open)}>
															{#if open && depth > 15}
																<div class="l15 {open ? 'open' : ''}" data-d={15 + depth} onclick={() => (open = !open)}>
																{#each items as item_16 (item_16.id)}
																	<div class="l16 {open ? 'open' : ''}" data-d={16 + depth} onclick={() => (open = !open)}>
																	{#await Promise.resolve(17) then v17}
																		<div class="l17 {open ? 'open' : ''}" data-d={17 + depth} onclick={() => (open = !open)}>
																		{#if open && depth > 18}
																			<div class="l18 {open ? 'open' : ''}" data-d={18 + depth} onclick={() => (open = !open)}>
																			{#each items as item_19 (item_19.id)}
																				<div class="l19 {open ? 'open' : ''}" data-d={19 + depth} onclick={() => (open = !open)}>
																				{#await Promise.resolve(20) then v20}
																					<div class="l20 {open ? 'open' : ''}" data-d={20 + depth} onclick={() => (open = !open)}>
																					{#if open && depth > 21}
																						<div class="l21 {open ? 'open' : ''}" data-d={21 + depth} onclick={() => (open = !open)}>
																						{#each items as item_22 (item_22.id)}
																							<div class="l22 {open ? 'open' : ''}" data-d={22 + depth} onclick={() => (open = !open)}>
																							{#await Promise.resolve(23) then v23}
																								<div class="l23 {open ? 'open' : ''}" data-d={23 + depth} onclick={() => (open = !open)}>
																								</div>
																							{/await}
																							</div>
																						{/each}
																						</div>
																					{/if}
																					</div>
																				{/await}
																				</div>
																			{/each}
																			</div>
																		{/if}
																		</div>
																	{/await}
																	</div>
																{/each}
																</div>
															{/if}
															</div>
														{/await}
														</div>
													{/each}
													</div>
												{/if}
												</div>
											{/await}
											</div>
										{/each}
										</div>
									{/if}
									</div>
								{/await}
								</div>
							{/each}
							</div>
						{/if}
						</div>
					{/await}
					</div>
				{/each}
				</div>
			{/if}
			</div>
		{/await}
		</div>
	{/each}
	</div>
{/if}

<style>
	.l0 {
		color: red;
	}
</style>
