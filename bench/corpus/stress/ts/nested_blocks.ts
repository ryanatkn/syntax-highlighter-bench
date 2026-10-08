// stress: statements, object literals, arrays, and generic types nested far deeper than code
// is written, each level indented one more tab

type Row = { a: Array<[number, string]> };

export function walk(v: Array<number>, m: Map<string, Array<Row>>): number {
	let total = 0;
	if (v[0]! > 0) {
		const o0: Row = { a: [[0, `k${total}0`]] };
		total += o0.a.length + (m.get('k0')?.[0]?.a[0]?.[0] ?? 0);
		for (const x1 of v) {
			const o1: Row = { a: [[1, `k${total}1`]] };
			total += o1.a.length + (m.get('k1')?.[0]?.a[0]?.[0] ?? 1);
			while (total < 20) {
				const o2: Row = { a: [[2, `k${total}2`]] };
				total += o2.a.length + (m.get('k2')?.[0]?.a[0]?.[0] ?? 2);
				try {
					const o3: Row = { a: [[3, `k${total}3`]] };
					total += o3.a.length + (m.get('k3')?.[0]?.a[0]?.[0] ?? 3);
					const f4 = (y: number): number => {
						const o4: Row = { a: [[4, `k${total}4`]] };
						total += o4.a.length + (m.get('k4')?.[0]?.a[0]?.[0] ?? 4);
						if (v[5]! > 5) {
							const o5: Row = { a: [[5, `k${total}5`]] };
							total += o5.a.length + (m.get('k5')?.[0]?.a[0]?.[0] ?? 5);
							for (const x6 of v) {
								const o6: Row = { a: [[6, `k${total}6`]] };
								total += o6.a.length + (m.get('k6')?.[0]?.a[0]?.[0] ?? 6);
								while (total < 70) {
									const o7: Row = { a: [[7, `k${total}7`]] };
									total += o7.a.length + (m.get('k7')?.[0]?.a[0]?.[0] ?? 7);
									try {
										const o8: Row = { a: [[8, `k${total}8`]] };
										total += o8.a.length + (m.get('k8')?.[0]?.a[0]?.[0] ?? 8);
										const f9 = (y: number): number => {
											const o9: Row = { a: [[9, `k${total}9`]] };
											total += o9.a.length + (m.get('k9')?.[0]?.a[0]?.[0] ?? 9);
											if (v[10]! > 10) {
												const o10: Row = { a: [[10, `k${total}10`]] };
												total += o10.a.length + (m.get('k10')?.[0]?.a[0]?.[0] ?? 10);
												for (const x11 of v) {
													const o11: Row = { a: [[11, `k${total}11`]] };
													total += o11.a.length + (m.get('k11')?.[0]?.a[0]?.[0] ?? 11);
													while (total < 120) {
														const o12: Row = { a: [[12, `k${total}12`]] };
														total += o12.a.length + (m.get('k12')?.[0]?.a[0]?.[0] ?? 12);
														try {
															const o13: Row = { a: [[13, `k${total}13`]] };
															total += o13.a.length + (m.get('k13')?.[0]?.a[0]?.[0] ?? 13);
															const f14 = (y: number): number => {
																const o14: Row = { a: [[14, `k${total}14`]] };
																total += o14.a.length + (m.get('k14')?.[0]?.a[0]?.[0] ?? 14);
																if (v[15]! > 15) {
																	const o15: Row = { a: [[15, `k${total}15`]] };
																	total += o15.a.length + (m.get('k15')?.[0]?.a[0]?.[0] ?? 15);
																	for (const x16 of v) {
																		const o16: Row = { a: [[16, `k${total}16`]] };
																		total += o16.a.length + (m.get('k16')?.[0]?.a[0]?.[0] ?? 16);
																		while (total < 170) {
																			const o17: Row = { a: [[17, `k${total}17`]] };
																			total += o17.a.length + (m.get('k17')?.[0]?.a[0]?.[0] ?? 17);
																			try {
																				const o18: Row = { a: [[18, `k${total}18`]] };
																				total += o18.a.length + (m.get('k18')?.[0]?.a[0]?.[0] ?? 18);
																				const f19 = (y: number): number => {
																					const o19: Row = { a: [[19, `k${total}19`]] };
																					total += o19.a.length + (m.get('k19')?.[0]?.a[0]?.[0] ?? 19);
																					if (v[20]! > 20) {
																						const o20: Row = { a: [[20, `k${total}20`]] };
																						total += o20.a.length + (m.get('k20')?.[0]?.a[0]?.[0] ?? 20);
																						for (const x21 of v) {
																							const o21: Row = { a: [[21, `k${total}21`]] };
																							total += o21.a.length + (m.get('k21')?.[0]?.a[0]?.[0] ?? 21);
																							while (total < 220) {
																								const o22: Row = { a: [[22, `k${total}22`]] };
																								total += o22.a.length + (m.get('k22')?.[0]?.a[0]?.[0] ?? 22);
																								try {
																									const o23: Row = { a: [[23, `k${total}23`]] };
																									total += o23.a.length + (m.get('k23')?.[0]?.a[0]?.[0] ?? 23);
																									const f24 = (y: number): number => {
																										const o24: Row = { a: [[24, `k${total}24`]] };
																										total += o24.a.length + (m.get('k24')?.[0]?.a[0]?.[0] ?? 24);
																										if (v[25]! > 25) {
																											const o25: Row = { a: [[25, `k${total}25`]] };
																											total += o25.a.length + (m.get('k25')?.[0]?.a[0]?.[0] ?? 25);
																											for (const x26 of v) {
																												const o26: Row = { a: [[26, `k${total}26`]] };
																												total += o26.a.length + (m.get('k26')?.[0]?.a[0]?.[0] ?? 26);
																												while (total < 270) {
																													const o27: Row = { a: [[27, `k${total}27`]] };
																													total += o27.a.length + (m.get('k27')?.[0]?.a[0]?.[0] ?? 27);
																													try {
																														const o28: Row = { a: [[28, `k${total}28`]] };
																														total += o28.a.length + (m.get('k28')?.[0]?.a[0]?.[0] ?? 28);
																														const f29 = (y: number): number => {
																															const o29: Row = { a: [[29, `k${total}29`]] };
																															total += o29.a.length + (m.get('k29')?.[0]?.a[0]?.[0] ?? 29);
																															if (v[30]! > 30) {
																																const o30: Row = { a: [[30, `k${total}30`]] };
																																total += o30.a.length + (m.get('k30')?.[0]?.a[0]?.[0] ?? 30);
																																for (const x31 of v) {
																																	const o31: Row = { a: [[31, `k${total}31`]] };
																																	total += o31.a.length + (m.get('k31')?.[0]?.a[0]?.[0] ?? 31);
																																	while (total < 320) {
																																		const o32: Row = { a: [[32, `k${total}32`]] };
																																		total += o32.a.length + (m.get('k32')?.[0]?.a[0]?.[0] ?? 32);
																																		try {
																																			const o33: Row = { a: [[33, `k${total}33`]] };
																																			total += o33.a.length + (m.get('k33')?.[0]?.a[0]?.[0] ?? 33);
																																			const f34 = (y: number): number => {
																																				const o34: Row = { a: [[34, `k${total}34`]] };
																																				total += o34.a.length + (m.get('k34')?.[0]?.a[0]?.[0] ?? 34);
																																				if (v[35]! > 35) {
																																					const o35: Row = { a: [[35, `k${total}35`]] };
																																					total += o35.a.length + (m.get('k35')?.[0]?.a[0]?.[0] ?? 35);
																																					for (const x36 of v) {
																																						const o36: Row = { a: [[36, `k${total}36`]] };
																																						total += o36.a.length + (m.get('k36')?.[0]?.a[0]?.[0] ?? 36);
																																						while (total < 370) {
																																							const o37: Row = { a: [[37, `k${total}37`]] };
																																							total += o37.a.length + (m.get('k37')?.[0]?.a[0]?.[0] ?? 37);
																																							try {
																																								const o38: Row = { a: [[38, `k${total}38`]] };
																																								total += o38.a.length + (m.get('k38')?.[0]?.a[0]?.[0] ?? 38);
																																								const f39 = (y: number): number => {
																																									const o39: Row = { a: [[39, `k${total}39`]] };
																																									total += o39.a.length + (m.get('k39')?.[0]?.a[0]?.[0] ?? 39);
																																								};
																																								total += f39(39);
																																							} catch (e38: unknown) {
																																							total--;
																																							}
																																						}
																																					}
																																				}
																																			};
																																			total += f34(34);
																																		} catch (e33: unknown) {
																																		total--;
																																		}
																																	}
																																}
																															}
																														};
																														total += f29(29);
																													} catch (e28: unknown) {
																													total--;
																													}
																												}
																											}
																										}
																									};
																									total += f24(24);
																								} catch (e23: unknown) {
																								total--;
																								}
																							}
																						}
																					}
																				};
																				total += f19(19);
																			} catch (e18: unknown) {
																			total--;
																			}
																		}
																	}
																}
															};
															total += f14(14);
														} catch (e13: unknown) {
														total--;
														}
													}
												}
											}
										};
										total += f9(9);
									} catch (e8: unknown) {
									total--;
									}
								}
							}
						}
					};
					total += f4(4);
				} catch (e3: unknown) {
				total--;
				}
			}
		}
	}
	return total;
}

export const deep = { k0: [1, ({ k3: [4, ({ k6: [7, ({ k9: [10, ({ k12: [13, ({ k15: [16, ({ k18: [19, ({ k21: [22, ({ k24: [25, ({ k27: [28, ({ k30: [31, ({ k33: [34, ({ k36: [37, ({ k39: [40, ({ k42: [43, ({ k45: [46, ({ k48: [49, ({ k51: [52, ({ k54: [55, ({ k57: [58, ({ k60: [61, ({ k63: [64, ({ k66: [67, ({ k69: [70, ({ k72: [73, ({ k75: [76, ({ k78: [79, ({ k81: [82, ({ k84: [85, ({ k87: [88, ({ k90: [91, ({ k93: [94, ({ k96: [97, ({ k99: [100, ({ k102: [103, ({ k105: [106, ({ k108: [109, ({ k111: [112, ({ k114: [115, ({ k117: [118, (null ?? 119), 'v118'], n: 117 } ?? 116), 'v115'], n: 114 } ?? 113), 'v112'], n: 111 } ?? 110), 'v109'], n: 108 } ?? 107), 'v106'], n: 105 } ?? 104), 'v103'], n: 102 } ?? 101), 'v100'], n: 99 } ?? 98), 'v97'], n: 96 } ?? 95), 'v94'], n: 93 } ?? 92), 'v91'], n: 90 } ?? 89), 'v88'], n: 87 } ?? 86), 'v85'], n: 84 } ?? 83), 'v82'], n: 81 } ?? 80), 'v79'], n: 78 } ?? 77), 'v76'], n: 75 } ?? 74), 'v73'], n: 72 } ?? 71), 'v70'], n: 69 } ?? 68), 'v67'], n: 66 } ?? 65), 'v64'], n: 63 } ?? 62), 'v61'], n: 60 } ?? 59), 'v58'], n: 57 } ?? 56), 'v55'], n: 54 } ?? 53), 'v52'], n: 51 } ?? 50), 'v49'], n: 48 } ?? 47), 'v46'], n: 45 } ?? 44), 'v43'], n: 42 } ?? 41), 'v40'], n: 39 } ?? 38), 'v37'], n: 36 } ?? 35), 'v34'], n: 33 } ?? 32), 'v31'], n: 30 } ?? 29), 'v28'], n: 27 } ?? 26), 'v25'], n: 24 } ?? 23), 'v22'], n: 21 } ?? 20), 'v19'], n: 18 } ?? 17), 'v16'], n: 15 } ?? 14), 'v13'], n: 12 } ?? 11), 'v10'], n: 9 } ?? 8), 'v7'], n: 6 } ?? 5), 'v4'], n: 3 } ?? 2), 'v1'], n: 0 };

export type Deep = Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, Array<Promise<Map<string, Readonly<Record<`k${number}`, number>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>;
