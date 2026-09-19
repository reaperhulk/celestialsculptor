//! Rule violations. The text is player-facing copy; the variant says why.
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SimError {
    /// Malformed, non-finite or out-of-range input.
    Invalid(String),
    /// The tool exists but is not unlocked in this challenge or mode.
    Locked(String),
    /// Matter, body or action capacity is exhausted.
    Capacity(String),
    /// Unsupported, corrupt or foreign saved data.
    Unsupported(String),
    /// Nothing to do, or an operation is out of order.
    Sequence(String),
}
impl SimError {
    pub fn message(&self) -> &str {
        match self {
            Self::Invalid(m)
            | Self::Locked(m)
            | Self::Capacity(m)
            | Self::Unsupported(m)
            | Self::Sequence(m) => m,
        }
    }
}
impl fmt::Display for SimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}
impl std::error::Error for SimError {}
impl From<SimError> for String {
    fn from(error: SimError) -> Self {
        error.message().to_owned()
    }
}
