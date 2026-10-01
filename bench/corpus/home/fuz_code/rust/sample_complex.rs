//! A sample module exercising the Rust lexer's token paths.

use std::collections::HashMap;
use std::fmt;

/// The maximum number of retries before giving up.
pub const MAX_RETRIES: u32 = 3;
static GREETING: &str = "hello, \"world\"\n";

#[derive(Debug, Clone, PartialEq)]
pub enum Event<'a> {
    Push { repo: &'a str, commits: usize },
    Tag(String),
    Empty,
}

/* a plain block comment
   /* they nest in rust */
   still inside the outer one */

#[derive(Default)]
pub struct Registry<T> {
    entries: HashMap<String, T>,
    hits: u64,
}

impl<T: fmt::Debug> Registry<T> {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            hits: 0_u64,
        }
    }

    /** Inserts an entry, returning the previous value if present. */
    pub fn insert(&mut self, key: &str, value: T) -> Option<T> {
        self.hits += 1;
        self.entries.insert(key.to_string(), value)
    }

    pub async fn drain(&mut self) -> Vec<T> {
        let drained: Vec<T> = self.entries.drain().map(|(_, v)| v).collect();
        drained
    }
}

impl fmt::Display for Event<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Event::Push { repo, commits } => write!(f, "{repo}: {commits} commits"),
            Event::Tag(name) => write!(f, "tag {name}"),
            Event::Empty => Ok(()),
        }
    }
}

macro_rules! count {
    ($($x:expr),*) => {
        [$($x),*].len()
    };
}

fn classify(byte: u8) -> char {
    match byte {
        b'a'..=b'z' => 'l',
        0x30..=0x39 => 'd',
        b'_' => '_',
        _ => '?',
    }
}

fn first_word<I>(words: I) -> Option<String>
where
    I: IntoIterator<Item = String>,
{
    let mut it = words.into_iter();
    let head = it.next()?;
    Some(head.trim().to_string())
}

async fn warm(registry: &mut Registry<i64>) -> usize {
    registry.drain().await.len()
}

pub fn main() {
    let mut registry: Registry<i64> = Registry::new();
    registry.insert("answer", 42);
    registry.insert("mask", 0b1010_0110 as i64);
    registry.insert("offset", 0o777);
    registry.insert("float-ish", 2.5e-3 as i64);

    let pattern = r#"a "raw" string with \ no escapes"#;
    let bytes = b"raw bytes\x00";
    let path = r"C:\temp";
    let emoji = '\u{1F600}';
    let newline = '\n';

    let total: usize = (0..MAX_RETRIES as usize).map(|i| i * 2).sum();
    let parsed = "17".parse::<u32>().unwrap_or(0);
    let verbose = true;
    let quiet: bool = !verbose && false;

    'outer: for (key, value) in [("a", 1), ("b", 2)] {
        if value > 1 && !key.is_empty() {
            println!("{key} -> {value}, total={total}, parsed={parsed}");
            break 'outer;
        }
    }

    assert_ne!(count!(1, 2, 3), 0);
    let seed = first_word(vec![String::from("seed")]);
    let _ = (pattern, bytes, path, emoji, newline, quiet, classify(b'x'), GREETING, seed, warm);

    unsafe {
        let raw: *const u64 = &registry.hits;
        debug_assert!(!raw.is_null());
    }
}
