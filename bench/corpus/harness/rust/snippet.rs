use std::collections::HashMap;

/// Counts how often each word appears in the text.
pub fn count_words(text: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        let key = word.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
        if key.is_empty() {
            continue;
        }
        *counts.entry(key).or_insert(0) += 1;
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_repeats() {
        assert_eq!(count_words("a b a")["a"], 2);
    }
}
