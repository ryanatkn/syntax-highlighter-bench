# Neutral inputs: attribution

The files under this directory are copied, unmodified, from the projects below,
each at the commit pinned in `../manifest.json` and listed in `../INPUTS.md`.
They remain under their own licenses and belong to their authors. They are here
only as inputs to measure, and nothing in this benchmark's own license applies
to them.

`svelte/harvest.svelte` is the one file not copied whole: it joins the blocks
of several components, bodies verbatim, and the manifest lists each of them.

| project | license | text |
| --- | --- | --- |
| https://github.com/microsoft/TypeScript | Apache-2.0 | [licenses/TypeScript.txt](licenses/TypeScript.txt) |
| https://github.com/microsoft/typescript-go | Apache-2.0 | [licenses/typescript-go.txt](licenses/typescript-go.txt), with its [licenses/typescript-go.NOTICE.txt](licenses/typescript-go.NOTICE.txt) |
| https://github.com/WebAssembly/component-model | Apache-2.0 | [licenses/component-model.txt](licenses/component-model.txt) |
| https://github.com/sveltejs/svelte | MIT | [licenses/svelte.txt](licenses/svelte.txt) |
| https://github.com/sveltejs/kit | MIT | [licenses/kit.txt](licenses/kit.txt) |
| https://github.com/sveltejs/language-tools | MIT | [licenses/language-tools.txt](licenses/language-tools.txt) |
| https://github.com/sveltejs/svelte.dev | MIT | [licenses/svelte.dev.txt](licenses/svelte.dev.txt) |
| https://github.com/prettier/prettier | MIT | [licenses/prettier.txt](licenses/prettier.txt) |
| https://github.com/w3c/csswg-drafts | W3C Software and Document License, 2023 version | [licenses/csswg-drafts.txt](licenses/csswg-drafts.txt) |
| https://github.com/postgres/postgres | PostgreSQL License | [licenses/postgres.txt](licenses/postgres.txt) |
| https://github.com/techniq/svelte-ux | MIT | [licenses/svelte-ux.txt](licenses/svelte-ux.txt) |
| https://github.com/techniq/layerchart | MIT | [licenses/layerchart.txt](licenses/layerchart.txt) |
| https://github.com/dimfeld/svelte-maplibre | MIT | [licenses/svelte-maplibre.txt](licenses/svelte-maplibre.txt) |
| https://github.com/themesberg/flowbite-svelte | MIT | [licenses/flowbite-svelte.txt](licenses/flowbite-svelte.txt) |
| https://github.com/tokio-rs/axum | MIT | [licenses/axum.txt](licenses/axum.txt) |
| https://github.com/BurntSushi/walkdir | Unlicense or MIT, used under MIT | [licenses/walkdir.txt](licenses/walkdir.txt) |
| https://github.com/rust-lang/hashbrown | MIT or Apache-2.0, used under MIT | [licenses/hashbrown.txt](licenses/hashbrown.txt) |
| https://github.com/jgthms/bulma | MIT | [licenses/bulma.txt](licenses/bulma.txt) |
| https://github.com/nvm-sh/nvm | MIT | [licenses/nvm.txt](licenses/nvm.txt) |

`css/default.css` and `html/Overview.src.html` include material copied from the
CSS Working Group's drafts, https://github.com/w3c/csswg-drafts. Copyright ©
World Wide Web Consortium. https://www.w3.org/copyright/software-license-2023/

The manifest records that license as
`LicenseRef-W3C-Software-and-Document-2023`: SPDX has an id for the 2015 version
of the license and none for the 2023 version the repository points to.
