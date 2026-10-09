# Results

What the files in this directory are, and how a timed run is published. The
method is summarized in [the README](../README.md#method-in-brief) and given in
full on the method page of the site's docs, [`/docs/method`](https://syntax-highlighter-bench.ryanatkn.com/docs/method) (its source is
../src/routes/docs/method/+page.svelte).

## What is in this directory

| file | what it is | committed |
| --- | --- | --- |
| `deterministic.json` | the numbers that are the same on any machine: bundle sizes, install footprints, retained heaps (for the Node version the check workflow pins), token counts, output sizes raw and compressed, coverage. `npm run bench:deterministic` regenerates it anywhere, and the check workflow fails when the committed file differs from what regenerates | yes |
| `latest.json` | the published timed run, which the site renders. Until a first run is published it is absent, and the site renders `deterministic.json` and shows no timed number | yes, once a run is published |
| `<UTC date>_<machine>.json` | a full run, as the harness writes it: named by the UTC date it started and the name given to `--machine`. `latest.json` is a copy of one of these, made by `npm run results:publish` | yes, for a run that is published |
| `calibration_<machine>.json` | a machine's noise floor, from a calibration run. A full run on the same machine copies the floor into its own file | yes, beside the run that carries it |
| `scratch/` | smoke runs and filtered runs, which are never publishable | no: git ignores it |
| `full_<machine>.journal.jsonl`, `calibrate_<machine>.journal.jsonl` | the journal of a timed run that has not finished: every process's result, appended as it is measured, so a stopped run can be resumed. It is removed when the results file is written | no: git ignores it |
| `*.journal.jsonl.overlapped`, `*.journal.jsonl.changed` | the journal of a run that lost the machine lock, or during which a measured package changed on disk, set aside. Another run may have overlapped it, or its samples are of two versions, so it can't be resumed: delete it | no: git ignores it |

A timed run never writes `latest.json`: `npm run results:publish` copies a
run's dated file to that name once the file is shown to be publishable, as the
steps below say. Every results file here goes through one schema,
`src/lib/results_schema.ts`.

## The publishing machine

Timed numbers are published from one named machine, and every published run
says which. No run is published yet, so no machine is recorded here. When one
is, this section states the following for it, and a run from another machine
replaces them.

| what | where it comes from | in the results file |
| --- | --- | --- |
| name | the name given to `--machine` | `meta.machine.name` |
| CPU model | `lscpu`, or the file | `meta.machine.cpu` |
| cores | `lscpu` | no |
| threads | the logical CPUs Node counts | `meta.machine.threads` |
| frequency driver | `/sys/devices/system/cpu/cpu0/cpufreq/scaling_driver` | `meta.machine.cpufreq_driver` |
| frequency governor | `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` | `meta.machine.governor` |
| energy-performance preference | `energy_performance_preference`, in the same directory | `meta.machine.epp` |
| boost | `/sys/devices/system/cpu/cpufreq/boost`, the first CPU's `boost`, or `intel_pstate/no_turbo` inverted | `meta.machine.boost` |
| memory | the file, in gigabytes | `meta.machine.memory_gb` |
| kernel release | `uname -r` | `meta.machine.os_release` |
| OS | `/etc/os-release` | no |
| Node version | `node --version` | `meta.node` |

The harness reads the first CPU's frequency settings, and is null for any the
OS doesn't expose. It logs when the CPUs run different governors.

The file also records the commit (`meta.commit`), the corpus hash
(`meta.corpus_hash`), and every library's version and extra packages
(`meta.libraries`). What the
file doesn't record is written here by hand when the run is published.

## Quieting the machine

Runs are comparable because the machine is prepared the same way each time,
not because it is perfectly quiet. The commands are for Linux with systemd, and
the unit names on a machine are its own: look at what it runs.

- **AC power, and the `performance` governor.** A governor that scales the
  frequency with load adds its own ramp to every batch. Check every core: the
  harness records the first, and only warns when the others differ:
  ```bash
  cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor | sort | uniq -c
  ```
  A driver with an energy preference beside the governor
  (`energy_performance_preference`, in the same directory) is set to
  `performance` too.
- **Nothing else running.** Close editors, browsers, chat clients, other
  terminal sessions, and anything that indexes or syncs files. One process is
  measured at a time, and anything else that wakes up lands in some library's
  batch and not in the others'. A timed run records the 1-minute load average
  as it starts (`meta.run.load_at_start`, the highest of its segments' when it
  was resumed), prints it in `--plan`, and warns when it is over 1. It never
  refuses: wait for the load to settle, or stop the run and find what is
  running. Right after another run, a calibration included, the load reads
  about 1 for a minute or so: wait for it to settle before starting.
- **No suspend.** Turn off automatic suspend on AC, so a long unattended run
  isn't stopped partway.
- **Timers and scheduled jobs stopped for the duration.** Package updates, log
  rotation, filesystem trims, and cron jobs start on their own schedule.
  `systemctl list-timers` shows what is due, and `sudo systemctl stop <unit>`
  stops one until it is started again or the machine reboots.
- **Swap flushed**, once everything is closed, so nothing is faulted back in
  from swap during the run. Check `free -h` for the headroom first:
  ```bash
  sudo swapoff -a && sudo swapon -a
  ```
- **The network off.** Everything after `npm ci` runs offline, the corpus
  included, so turning the network off for the run is safe, and it removes a
  source of noise: no sync, update check, or notification wakes up mid-batch.
  With NetworkManager: `nmcli networking off`, or `nmcli radio wifi off` for
  Wi-Fi alone.
- **A thermal settle.** On a hard flat surface, idle for a few minutes before
  starting, so every run starts from about the same temperature. A long run
  heats a laptop, and the anchor and the retries are what catch throttling.
- **CPU boost, SMT, and ASLR left at their defaults.** Turning any of them off
  can tighten the spread, and makes the run incomparable with every run that
  left them on.

## Publishing a run

A full run is one process for each library, pass, and cell, then one for each
sample of each cold-start scenario, one at a time. A calibration gives each
library twice the passes, so its cells take twice as long. `--plan` prints the
process count and an estimate for either, and measures nothing.

Everything below runs on the publishing machine, from the root of the checkout.

1. **A clean tree at the commit to publish.** `git status --short` prints
   nothing outside `results/`. A run records the commit it ran at, and a run
   from a tree with changes the commit doesn't hold, untracked files included,
   is marked `-dirty` and can't be published. Changes under `results/` don't
   count, so a calibration file that isn't committed yet leaves the run clean.
2. **Install exactly the locked versions.**
   ```bash
   npm ci
   ```
3. **The deterministic file is current.**
   ```bash
   npm run bench:deterministic -- --check
   ```
   If it fails, regenerate with `npm run bench:deterministic`, commit the file,
   and start again from step 1: a full run is refused unless the file describes
   the libraries and corpus it is about to measure. The compressed sizes depend
   on the zlib and brotli inside Node, so use the Node version the check
   workflow uses (../.github/workflows/check.yml).
4. **Smoke.**
   ```bash
   npm run bench:smoke
   ```
   It runs every library on every cell and every cold-start scenario once and
   checks each against the deterministic file, so a disagreement stops this
   short run and not the long one. Its numbers mean nothing, and its file goes
   to `scratch/`. `npm run bench:smoke -- --plan` prints an estimate.
5. **Quiet the machine**, as above. Everything from here on is a measurement.
6. **Calibrate**, unless this machine has a calibration that still describes
   the run: the plan in step 7 says so on its `noise floor` line. A
   calibration from an earlier measurement method doesn't parse, and the plan
   refuses it: calibrate again.
   ```bash
   npm run bench:calibrate -- --machine <name> --plan  # what it would do
   npm run bench:calibrate -- --machine <name>
   ```
   It measures every library as if it were two, in separate processes, and how
   far the two are apart is the noise floor: for one cell, and for a geometric
   mean. It covers the timed cells only, and cold start has no noise floor. It
   writes `calibration_<name>.json`, replacing the one before. Its anchor must
   be stable, or the floor is not carried: run it again.

   A full run carries the floor only from a calibration that was not filtered,
   whose anchor was stable, and that has the same machine name, CPU, threads,
   frequency driver, governor, energy-performance preference, and boost, the
   same Node version, corpus hash, and parameters (`--passes`, `--rounds`,
   `--target-ms`, the warmup and rewarm, and `--retries`), and every library at
   the same version with the same extra packages. When any of those has
   changed, calibrate again. The harness doesn't compare the commit, the
   kernel, or `NODE_OPTIONS` of a calibration, so calibrate again after any of
   them changes in a way that could move a time.
7. **Plan the full run**, and read the plan.
   ```bash
   npm run bench -- --machine <name> --plan
   ```
   `noise floor` must say it is carried from the calibration, and otherwise it
   gives the reason. `bundle sizes` must say they are carried from the
   deterministic results file, which carries the install footprints, the
   retained heaps, and the compressed HTML sizes with them. `commit` must have no `-dirty`. `output` is the
   file the run will write. The estimate assumes calls shorter than a batch, so
   it misses Shiki's cells on the long-line stress inputs, where a call takes
   seconds: expect the run to take tens of minutes longer than it says.
8. **The full run.**
   ```bash
   npm run bench -- --machine <name>
   ```
   It writes `<UTC date>_<name>.json`, prints the path it wrote and a summary,
   and removes its journal. It won't overwrite a run of the same date and machine: move that
   file, or delete it if it is not one to keep.
9. **If it stops**, by a signal, a failed process, or a crash, the journal
   stays and the run says how to continue: the same command with `--resume`.
   ```bash
   npm run bench -- --machine <name> --resume
   npm run bench:calibrate -- --machine <name> --resume  # a stopped calibration
   ```
   The resumed run must be the same run: the same flags, corpus, library
   versions, machine name, CPU, threads, frequency driver, governor,
   energy-performance preference, boost, kernel release, Node version,
   `NODE_OPTIONS`, and commit. So between stopping and resuming, commit
   nothing, install nothing, and update nothing. A resume that is refused names
   what differs. To start over instead, delete the journal. If the journal was
   set aside as `.overlapped` (another run held the machine at the same time)
   or as `.changed` (a measured package changed on disk during the run), delete
   it and start over.
10. **Check the run**, with the list below. A run that fails a check is
    measured again, not published with a note.
11. **Make it the published run.**
    ```bash
    npm run results:publish -- results/<UTC date>_<name>.json
    ```
    It refuses, with the reasons, a file that is not in `results/` itself
    (followed through links, so not in `scratch/`), is `latest.json`, is not a
    results file, or is not publishable (the same test the build applies, in step
    12), and otherwise writes `latest.json` as a byte-for-byte copy.
12. **Build the site over it.** With `BENCH_RESULTS_FIXTURE` unset:
    ```bash
    gro build --no-install
    ```
    `--no-install` skips the install `gro build` starts with, so the step
    needs no network. The build parses `latest.json` and fails, saying why, if the run is not
    publishable: a smoke run, a calibration, a filtered run, a run with a gap,
    a `-dirty` commit, an anchor that drifted, or no noise floor. It also fails if the run and
    `deterministic.json` describe the same library versions, install closures,
    and corpus and their deterministic numbers differ. Retained heaps that
    differ by more than a reading's jitter, as after a Node upgrade, render the
    run as a snapshot instead.
13. **Commit** `latest.json`, the dated file, and the calibration file, and
    fill in the machine section above if the machine is new or has changed.

## The checks a run must pass

The build in step 12 enforces four of these: a stable anchor, a clean commit,
a whole, unfiltered full run, and a noise floor. The rest are yours to read,
and the build passes whatever they say: the exclusions, the disturbed cells,
the size of the noise floor, the process noise, and the versions. The summary a run prints has a line for most of them, and the
file holds the same facts. To read them from the file:

```bash
node -e "const m=require('./results/latest.json').meta;console.log(m.commit,m.node,m.machine,m.anchor,m.noise_floor,m.process_noise,m.run.segments,m.excluded.length,m.startup_excluded.length,m.libraries.map(l=>l.id+'@'+l.version).join(' '))"
```

- [ ] **The anchor is stable.** `anchor drift` is within 3% either way and the
      line doesn't say `UNSTABLE` (`meta.anchor.stable`). Past 3% the machine changed state
      during the run, and the site refuses the file.
- [ ] **Nothing is excluded that shouldn't be.** `excluded: none` and
      `cold start excluded: none`, or every entry listed is one you can
      explain. An exclusion means a library failed its output check there. That
      is a finding about the library or the adapter, and the build doesn't stop
      it, so it is on you to read.
- [ ] **The rounds agreed.** `disturbed: none`. Each library's line gives its
      median and worst `spread`, which should be near 1. A library-cell listed
      as still over 1.25 after its retries was disturbed by something: a few
      can be explained, and many mean the machine was busy. `retried` says
      how many library-cells were measured again, and each is marked in the
      file by `attempts`.
- [ ] **The noise floor is there, and small enough.** `noise floor` gives a
      figure per cell and one for a geomean, and is not `none`. The harness runs
      without one, and the build refuses a file that has none, so check the plan
      in step 7 before the run rather than after. A difference
      between two libraries that is smaller than the floor is not a difference,
      so a floor larger than the differences the results are read for means the
      machine was not quiet enough: quiet it and calibrate again.
- [ ] **The processes agreed about as well as the calibration's did.**
      `process noise` gives the 95th percentile gap between two processes
      measuring the same library on the same cell (`meta.process_noise.p95`),
      beside the calibration's figure for the same thing
      (`meta.noise_floor.per_process`). Compare them. Each is the 95th
      percentile of one sample, so the run's is higher about half the time: a
      run's several times the calibration's is the thing to look for, and means
      the machine was busier than when it was calibrated, so quiet it and run
      again. The build doesn't check it.
- [ ] **A resumed run held still.** `resumed: measured in … segments` is fine
      when the anchor is stable: its drift is taken across every segment
      (`meta.run.segments`).
- [ ] **The commit is clean.** `meta.commit` has no `-dirty`, and is the commit
      you meant to publish.
- [ ] **The versions are the ones intended**: each library's in
      `meta.libraries`, and `meta.node`.
- [ ] **`gro build` passes** with the file in place as `latest.json`.

## What a published file does not show

- **Markdown without its fences.** A timed process loads only the language it
  measures, so fenced code inside Markdown is mostly not highlighted. See
  [the caveats](../README.md#caveats).
- **No noise floor for cold start.** A calibration measures the timed cells
  only. Read a cold-start difference against the two scenarios' `p10_ms` to
  `p90_ms` bands. See [`/docs/method`](https://syntax-highlighter-bench.ryanatkn.com/docs/method).
- **Memory is a whole process.** `rss_peak_bytes` is the peak resident size of
  a process: Node, the library, and the input, not what the library adds. See
  [`/docs/method`](https://syntax-highlighter-bench.ryanatkn.com/docs/method).
- **Some inputs are a library's own samples.** They are labelled with that
  library and kept out of the headline figures. See
  [the corpus](../README.md#corpus).

The numbers are also one machine's, on Node. Compare the ratios between
libraries before the absolute times.

## Re-running

A published run describes what it measured, and stops describing the checkout
when any of these changes:

- **the corpus**: its hash is in the file, and runs with different hashes are
  not comparable
- **the method**: a change to how the harness measures, or to its parameters
- **a library's version**, or that of a package it is measured with
- **the Node version**
- **the machine**, its frequency settings included

When a library's version or the corpus has moved since the run, the site still
renders `latest.json`, as the snapshot it is, and says what has moved. For the
others, measure again: calibrate if step 6 says to, run, and replace
`latest.json`.

Two runs can be compared with each other only when they share a corpus hash, a
method, and a machine. This directory keeps no history across versions yet:
that is a later addition, and until then each published run stands alone.
