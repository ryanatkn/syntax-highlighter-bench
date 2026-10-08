// stress: block comments nested deep (Rust nests them), generic types nested deep, raw
// strings holding quotes and hashes, and blocks nested deep

use std::collections::HashMap;

#[derive(Debug)]
pub struct Error;

/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/* nested comment */*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/

pub type Deep = Vec<Option<Result<Box<HashMap<String, Vec<Option<Result<Box<HashMap<String, Vec<Option<Result<Box<HashMap<String, Vec<Option<Result<Box<HashMap<String, Vec<Option<Result<Box<HashMap<String, Vec<Option<Result<Box<HashMap<String, Vec<Option<u8>>>>, Error>>>>>, Error>>>>>, Error>>>>>, Error>>>>>, Error>>>>>, Error>>>;

pub const RAW: &str = r##"a raw string with "quotes", a "# and \n inside"##;
pub const RAW2: &str = r#"another with ## and "inner" text"#;

pub fn walk(v: &[i64]) -> i64 {
	let mut total: i64 = 0;
	if let Some(x0) = v.get(0) {
		total += 0i64 << 1; // level 0 /* not a block */
		for x1 in v.iter().copied() {
			total += 1i64 << 1; // level 1 /* not a block */
			match total {
				2..=i64::MAX => {
				total += 2i64 << 1; // level 2 /* not a block */
				{
					total += 3i64 << 1; // level 3 /* not a block */
					if let Some(x4) = v.get(4) {
						total += 4i64 << 1; // level 4 /* not a block */
						for x5 in v.iter().copied() {
							total += 5i64 << 1; // level 5 /* not a block */
							match total {
								6..=i64::MAX => {
								total += 6i64 << 1; // level 6 /* not a block */
								{
									total += 7i64 << 1; // level 7 /* not a block */
									if let Some(x8) = v.get(8) {
										total += 8i64 << 1; // level 8 /* not a block */
										for x9 in v.iter().copied() {
											total += 9i64 << 1; // level 9 /* not a block */
											match total {
												10..=i64::MAX => {
												total += 10i64 << 1; // level 10 /* not a block */
												{
													total += 11i64 << 1; // level 11 /* not a block */
													if let Some(x12) = v.get(12) {
														total += 12i64 << 1; // level 12 /* not a block */
														for x13 in v.iter().copied() {
															total += 13i64 << 1; // level 13 /* not a block */
															match total {
																14..=i64::MAX => {
																total += 14i64 << 1; // level 14 /* not a block */
																{
																	total += 15i64 << 1; // level 15 /* not a block */
																	if let Some(x16) = v.get(16) {
																		total += 16i64 << 1; // level 16 /* not a block */
																		for x17 in v.iter().copied() {
																			total += 17i64 << 1; // level 17 /* not a block */
																			match total {
																				18..=i64::MAX => {
																				total += 18i64 << 1; // level 18 /* not a block */
																				{
																					total += 19i64 << 1; // level 19 /* not a block */
																					if let Some(x20) = v.get(20) {
																						total += 20i64 << 1; // level 20 /* not a block */
																						for x21 in v.iter().copied() {
																							total += 21i64 << 1; // level 21 /* not a block */
																							match total {
																								22..=i64::MAX => {
																								total += 22i64 << 1; // level 22 /* not a block */
																								{
																									total += 23i64 << 1; // level 23 /* not a block */
																									if let Some(x24) = v.get(24) {
																										total += 24i64 << 1; // level 24 /* not a block */
																										for x25 in v.iter().copied() {
																											total += 25i64 << 1; // level 25 /* not a block */
																											match total {
																												26..=i64::MAX => {
																												total += 26i64 << 1; // level 26 /* not a block */
																												{
																													total += 27i64 << 1; // level 27 /* not a block */
																													if let Some(x28) = v.get(28) {
																														total += 28i64 << 1; // level 28 /* not a block */
																														for x29 in v.iter().copied() {
																															total += 29i64 << 1; // level 29 /* not a block */
																															match total {
																																30..=i64::MAX => {
																																total += 30i64 << 1; // level 30 /* not a block */
																																{
																																	total += 31i64 << 1; // level 31 /* not a block */
																																}
																																}
																																_ => {}
																															}
																														}
																													}
																												}
																												}
																												_ => {}
																											}
																										}
																									}
																								}
																								}
																								_ => {}
																							}
																						}
																					}
																				}
																				}
																				_ => {}
																			}
																		}
																	}
																}
																}
																_ => {}
															}
														}
													}
												}
												}
												_ => {}
											}
										}
									}
								}
								}
								_ => {}
							}
						}
					}
				}
				}
				_ => {}
			}
		}
	}
	total
}
