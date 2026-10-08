<div class="fixture-banner" role="status">
	<strong>fixture data — invented numbers, not measurements</strong>
</div>

<style>
	/* sticks to the bottom of the viewport while the page scrolls, and takes its own
	   room at the end of the page, so it never covers what is under it */
	.fixture-banner {
		position: sticky;
		bottom: 0;
		z-index: 100;
		padding: var(--space_sm) var(--space_md);
		text-align: center;
		color: var(--text_100);
		background-color: var(--shade_00);
		border-top: var(--border_width_4) var(--border_style) var(--palette_c_50);
	}
</style>
