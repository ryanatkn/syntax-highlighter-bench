#!/usr/bin/env bash
# stress: command substitutions and parameter expansions nested deep, then control flow
# nested deep
set -euo pipefail

deep=$(echo "l0 $(echo "l1 $(echo "l2 $(echo "l3 $(echo "l4 $(echo "l5 $(echo "l6 $(echo "l7 $(echo "l8 $(echo "l9 $(echo "l10 $(echo "l11 $(echo "l12 $(echo "l13 $(echo "l14 $(echo "l15 $(echo leaf)")")")")")")")")")")")")")")")")
fallback="${v0:-${v1:-${v2:-${v3:-${v4:-${v5:-${v6:-${v7:-${v8:-${v9:-${v10:-${v11:-${v12:-${v13:-${v14:-${v15:-${z}}}}}}}}}}}}}}}}}"

if [[ -n "${deep:-}" && $(( 0 + 1 )) -gt 0 ]]; then
	printf '%s\n' "level 0: ${f0:-none} $(basename "$0")"
	for f1 in "${files[@]:-a b}"; do
		printf '%s\n' "level 1: ${f1:-none} $(basename "$0")"
		case "${mode:-x}" in
			x2|y2)
			printf '%s\n' "level 2: ${f2:-none} $(basename "$0")"
			if [[ -n "${deep:-}" && $(( 3 + 1 )) -gt 0 ]]; then
				printf '%s\n' "level 3: ${f3:-none} $(basename "$0")"
				for f4 in "${files[@]:-a b}"; do
					printf '%s\n' "level 4: ${f4:-none} $(basename "$0")"
					case "${mode:-x}" in
						x5|y5)
						printf '%s\n' "level 5: ${f5:-none} $(basename "$0")"
						if [[ -n "${deep:-}" && $(( 6 + 1 )) -gt 0 ]]; then
							printf '%s\n' "level 6: ${f6:-none} $(basename "$0")"
							for f7 in "${files[@]:-a b}"; do
								printf '%s\n' "level 7: ${f7:-none} $(basename "$0")"
								case "${mode:-x}" in
									x8|y8)
									printf '%s\n' "level 8: ${f8:-none} $(basename "$0")"
									if [[ -n "${deep:-}" && $(( 9 + 1 )) -gt 0 ]]; then
										printf '%s\n' "level 9: ${f9:-none} $(basename "$0")"
										for f10 in "${files[@]:-a b}"; do
											printf '%s\n' "level 10: ${f10:-none} $(basename "$0")"
											case "${mode:-x}" in
												x11|y11)
												printf '%s\n' "level 11: ${f11:-none} $(basename "$0")"
												if [[ -n "${deep:-}" && $(( 12 + 1 )) -gt 0 ]]; then
													printf '%s\n' "level 12: ${f12:-none} $(basename "$0")"
													for f13 in "${files[@]:-a b}"; do
														printf '%s\n' "level 13: ${f13:-none} $(basename "$0")"
													done
												fi
												;;
											esac
										done
									fi
									;;
								esac
							done
						fi
						;;
					esac
				done
			fi
			;;
		esac
	done
fi
