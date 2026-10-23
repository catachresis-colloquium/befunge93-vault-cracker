// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// Microbenchmark for the Befunge-93 Vault Cracker Zig C-ABI implementation.

const std = @import("std");

const Timespec = extern struct {
    sec: isize,
    nsec: isize,
};

extern "c" fn clock_gettime(clk_id: c_int, tp: *Timespec) c_int;

extern fn befunge93_vault_cracker_init() ?*anyopaque;
extern fn befunge93_vault_cracker_free(?*anyopaque) void;
extern fn befunge93_vault_cracker_run_vault(?*anyopaque, ?[*]u8, u32, ?*u32) c_int;

fn monotonicNs() u64 {
    var ts: Timespec = .{ .sec = 0, .nsec = 0 };
    _ = clock_gettime(1, &ts); // CLOCK_MONOTONIC = 1 on Linux/BSD/macOS-POSIX
    const s: u64 = @intCast(@max(ts.sec, 0));
    const ns: u64 = @intCast(@max(ts.nsec, 0));
    return s * 1_000_000_000 + ns;
}

pub fn main() !void {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);

    const iterations: u64 = 50_000;
    var out: [16]u8 = undefined;
    var out_len: u32 = 0;

    const start_ns = monotonicNs();
    var i: u64 = 0;
    while (i < iterations) : (i += 1) {
        const rc = befunge93_vault_cracker_run_vault(handle, &out, out.len, &out_len);
        if (rc != 0 or out_len != 8) return error.BenchInvariantFailed;
        std.mem.doNotOptimizeAway(&out);
    }
    const elapsed_ns = monotonicNs() -| start_ns;
    const ns_per_op = elapsed_ns / iterations;
    std.debug.print(
        "zig-ffi bench: {d} vault executions in {d} ns ({d} ns/op, passcode={s})\n",
        .{ iterations, elapsed_ns, ns_per_op, out[0..out_len] },
    );
}
