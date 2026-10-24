// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// Befunge-93 Vault Cracker FFI Integration Tests (C-ABI boundary)

const std = @import("std");
const testing = std.testing;

extern fn befunge93_vault_cracker_init() ?*anyopaque;
extern fn befunge93_vault_cracker_free(?*anyopaque) void;
extern fn befunge93_vault_cracker_torus_step(u32, u32, u32, ?*u32, ?*u32) c_int;
extern fn befunge93_vault_cracker_eval_grid(?*anyopaque, ?[*]const u8, u32, u32, ?[*]u8, u32, ?*u32, ?*u32) c_int;
extern fn befunge93_vault_cracker_run_vault(?*anyopaque, ?[*]u8, u32, ?*u32) c_int;
extern fn befunge93_vault_cracker_last_error() ?[*:0]const u8;
extern fn befunge93_vault_cracker_version() [*:0]const u8;
extern fn befunge93_vault_cracker_build_info() [*:0]const u8;
extern fn befunge93_vault_cracker_is_initialized(?*anyopaque) u32;

test "create and destroy handle" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);
    try testing.expectEqual(@as(u32, 1), befunge93_vault_cracker_is_initialized(handle));
}

test "null handle is not initialized and free(null) is a no-op" {
    try testing.expectEqual(@as(u32, 0), befunge93_vault_cracker_is_initialized(null));
    befunge93_vault_cracker_free(null);
}

test "null pointer diagnostics across C ABI" {
    var out: [16]u8 = undefined;
    var out_len: u32 = 0;
    try testing.expectEqual(@as(c_int, 4), befunge93_vault_cracker_run_vault(null, &out, out.len, &out_len));
    try testing.expect(befunge93_vault_cracker_last_error() != null);
}

test "10x10 torus coordinate wrap-around invariants" {
    var nr: u32 = 99;
    var nc: u32 = 99;

    // Right wrap from (0, 9) -> (0, 0)
    try testing.expectEqual(@as(c_int, 0), befunge93_vault_cracker_torus_step(0, 9, 0, &nr, &nc));
    try testing.expectEqual(@as(u32, 0), nr);
    try testing.expectEqual(@as(u32, 0), nc);

    // Up wrap from (0, 4) -> (9, 4)
    try testing.expectEqual(@as(c_int, 0), befunge93_vault_cracker_torus_step(0, 4, 3, &nr, &nc));
    try testing.expectEqual(@as(u32, 9), nr);
    try testing.expectEqual(@as(u32, 4), nc);

    // Out-of-range coordinates rejected with invalid_param (2)
    try testing.expectEqual(@as(c_int, 2), befunge93_vault_cracker_torus_step(10, 0, 0, &nr, &nc));
}

test "native Zig C-ABI vault execution emits 98261047" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);

    var out: [16]u8 = undefined;
    var out_len: u32 = 0;
    try testing.expectEqual(@as(c_int, 0), befunge93_vault_cracker_run_vault(handle, &out, out.len, &out_len));
    try testing.expectEqual(@as(u32, 8), out_len);
    try testing.expectEqualStrings("98261047", out[0..out_len]);

    // Too-small buffer rejected with invalid_param (2)
    try testing.expectEqual(@as(c_int, 2), befunge93_vault_cracker_run_vault(handle, &out, 4, &out_len));
}

test "eval_grid C-ABI executes torus wrap and arithmetic" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);

    const wrap_grid =
        "<^ \"6402\"0" ++
        "         \\" ++
        ">   v     " ++
        "^   :     " ++
        "^  ,_$   v" ++
        " #======# " ++
        " |TORUS!| " ++
        " |WRAP93| " ++
        "^ \"319\"<  " ++
        " >77*4+^ @";

    var out: [32]u8 = undefined;
    var out_len: u32 = 0;
    var halted: u32 = 0;
    try testing.expectEqual(
        @as(c_int, 0),
        befunge93_vault_cracker_eval_grid(handle, wrap_grid.ptr, 100, 500, &out, out.len, &out_len, &halted),
    );
    try testing.expectEqual(@as(u32, 1), halted);
    try testing.expectEqualStrings("31956402", out[0..out_len]);
}

test "version and build_info metadata" {
    const ver = std.mem.span(befunge93_vault_cracker_version());
    const info = std.mem.span(befunge93_vault_cracker_build_info());
    try testing.expectEqualStrings("0.2.0", ver);
    try testing.expect(std.mem.indexOf(u8, info, "befunge93-vault-cracker") != null);
}
