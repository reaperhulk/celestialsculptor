use std::{fs, process::Command};
fn cli(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_sculptor"))
        .args(args)
        .output()
        .unwrap()
}
#[test]
fn cli_reports_help_and_rejects_ambiguous_arguments() {
    let help = cli(&["--help"]);
    assert!(help.status.success());
    assert!(String::from_utf8(help.stdout)
        .unwrap()
        .contains("without a browser"));
    for args in [
        vec!["unknown"],
        vec!["replay"],
        vec!["verify", "ignored"],
        vec!["replay", "missing.json", "ignored"],
    ] {
        let result = cli(&args);
        assert!(!result.status.success());
        assert!(String::from_utf8(result.stderr).unwrap().contains("Usage:"));
    }
}
#[test]
fn cli_bounds_file_reads_and_rejects_invalid_replays() {
    let file = std::env::temp_dir().join(format!("sculptor-cli-{}.json", std::process::id()));
    for (content, message) in [
        ("x".repeat(1_000_000), "exceeds 512 KB".to_string()),
        ("{}".into(), "missing field".into()),
    ] {
        fs::write(&file, content).unwrap();
        let result = cli(&["replay", file.to_str().unwrap()]);
        assert!(!result.status.success());
        assert!(String::from_utf8(result.stderr).unwrap().contains(&message));
    }
    fs::remove_file(file).unwrap();
}
