// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// Befunge-93 Vault Cracker Zig C-ABI FFI Implementation
//
// Implements the C-compatible FFI declared in src/abi/Foreign.idr and
// ffi/zig/include/befunge93_vault_cracker.h: handle lifecycle, 10x10 torus
// coordinate arithmetic, and full 26-opcode Befunge-93 10x10 torus execution
// (including self-modifying `p`/`g`, `#` bridge, arithmetic, and branches).

const std = @import("std");

const VERSION: [:0]const u8 = "0.2.0";
const BUILD_INFO: [:0]const u8 = "befunge93-vault-cracker built with Zig " ++ @import("builtin").zig_version_string;

const CANONICAL_GRID: *const [100:0]u8 =
    "0\"7401\"v  " ++
    "v\"9826\"< \\" ++
    ">   v     " ++
    "^   :     " ++
    "^  ,_$   v" ++
    " #======# " ++
    " |VAULT!| " ++
    " |93-TEA| " ++
    " #======# " ++
    "         @";

threadlocal var last_error: ?[:0]const u8 = null;

fn setError(msg: [:0]const u8) void {
    last_error = msg;
}

fn clearError() void {
    last_error = null;
}

pub const Result = enum(c_int) {
    ok = 0,
    @"error" = 1,
    invalid_param = 2,
    out_of_memory = 3,
    null_pointer = 4,
};

pub const Handle = struct {
    allocator: std.mem.Allocator,
    initialized: bool,
};

export fn befunge93_vault_cracker_init() ?*Handle {
    const allocator = std.heap.c_allocator;
    const handle = allocator.create(Handle) catch {
        setError("Failed to allocate handle");
        return null;
    };
    handle.* = .{
        .allocator = allocator,
        .initialized = true,
    };
    clearError();
    return handle;
}

export fn befunge93_vault_cracker_free(handle: ?*Handle) void {
    const h = handle orelse return;
    if (!h.initialized) return;
    const allocator = h.allocator;
    h.initialized = false;
    allocator.destroy(h);
    clearError();
}

export fn befunge93_vault_cracker_is_initialized(handle: ?*Handle) u32 {
    const h = handle orelse return 0;
    return if (h.initialized) 1 else 0;
}

/// Advance a 10x10 torus coordinate by direction (0=right, 1=down, 2=left, 3=up).
export fn befunge93_vault_cracker_torus_step(
    row: u32,
    col: u32,
    dir: u32,
    out_row: ?*u32,
    out_col: ?*u32,
) Result {
    const r_ptr = out_row orelse {
        setError("Null out_row pointer");
        return .null_pointer;
    };
    const c_ptr = out_col orelse {
        setError("Null out_col pointer");
        return .null_pointer;
    };
    if (row >= 10 or col >= 10 or dir > 3) {
        setError("Coordinates must be in 0..9 and dir in 0..3");
        return .invalid_param;
    }
    r_ptr.* = switch (dir) {
        1 => (row + 1) % 10,
        3 => (row + 9) % 10,
        else => row,
    };
    c_ptr.* = switch (dir) {
        0 => (col + 1) % 10,
        2 => (col + 9) % 10,
        else => col,
    };
    clearError();
    return .ok;
}

fn popStack(stack: *[512]i64, sp: *usize) i64 {
    if (sp.* == 0) return 0;
    sp.* -= 1;
    return stack[sp.*];
}

fn pushStack(stack: *[512]i64, sp: *usize, val: i64) bool {
    if (sp.* >= stack.len) return false;
    stack[sp.*] = val;
    sp.* += 1;
    return true;
}

fn advanceCoord(r: *usize, c: *usize, dir: u2) void {
    r.* = switch (dir) {
        1 => if (r.* == 9) 0 else r.* + 1,
        3 => if (r.* == 0) 9 else r.* - 1,
        else => r.*,
    };
    c.* = switch (dir) {
        0 => if (c.* == 9) 0 else c.* + 1,
        2 => if (c.* == 0) 9 else c.* - 1,
        else => c.*,
    };
}

fn executeGrid10x10(
    grid_bytes: *const [100]u8,
    max_steps: u32,
    out_buf: [*]u8,
    out_cap: u32,
    out_len: *u32,
    out_halted: *u32,
    allow_self_mod: bool,
) Result {
    if (max_steps == 0) {
        setError("max_steps must be >= 1");
        return .invalid_param;
    }

    var mut_grid: [100]u8 = undefined;
    if (allow_self_mod) {
        mut_grid = grid_bytes.*;
    }

    var stack: [512]i64 = undefined;
    var sp: usize = 0;
    var r: usize = 0;
    var c: usize = 0;
    var dir: u2 = 0; // 0=right, 1=down, 2=left, 3=up
    var string_mode = false;
    var written: u32 = 0;
    var steps: u32 = 0;

    while (steps < max_steps) {
        const ch = if (allow_self_mod) mut_grid[r * 10 + c] else grid_bytes[r * 10 + c];
        steps += 1;

        if (string_mode) {
            if (ch == '"') {
                string_mode = false;
            } else {
                if (!pushStack(&stack, &sp, @intCast(ch))) {
                    setError("VM stack overflow");
                    return .out_of_memory;
                }
            }
            advanceCoord(&r, &c, dir);
            continue;
        }

        var skip_next = false;
        switch (ch) {
            '0'...'9' => {
                if (!pushStack(&stack, &sp, @intCast(ch - '0'))) {
                    setError("VM stack overflow");
                    return .out_of_memory;
                }
            },
            '"' => string_mode = true,
            '>' => dir = 0,
            'v' => dir = 1,
            '<' => dir = 2,
            '^' => dir = 3,
            '?' => dir = @intCast(steps % 4),
            '_' => {
                const v = popStack(&stack, &sp);
                dir = if (v == 0) 0 else 2;
            },
            '|' => {
                const v = popStack(&stack, &sp);
                dir = if (v == 0) 1 else 3;
            },
            '+' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, b +% a)) return .out_of_memory;
            },
            '-' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, b -% a)) return .out_of_memory;
            },
            '*' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, b *% a)) return .out_of_memory;
            },
            '/' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                const q: i64 = if (a == 0)
                    0
                else if (b == std.math.minInt(i64) and a == -1)
                    std.math.maxInt(i64)
                else
                    @divTrunc(b, a);
                if (!pushStack(&stack, &sp, q)) return .out_of_memory;
            },
            '%' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                const rem_val: i64 = if (a == 0 or (b == std.math.minInt(i64) and a == -1))
                    0
                else
                    @rem(b, a);
                if (!pushStack(&stack, &sp, rem_val)) return .out_of_memory;
            },
            '!' => {
                const v = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, if (v == 0) 1 else 0)) return .out_of_memory;
            },
            '`' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, if (b > a) 1 else 0)) return .out_of_memory;
            },
            ':' => {
                const v = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, v)) return .out_of_memory;
                if (!pushStack(&stack, &sp, v)) return .out_of_memory;
            },
            '\\' => {
                const a = popStack(&stack, &sp);
                const b = popStack(&stack, &sp);
                if (!pushStack(&stack, &sp, a)) return .out_of_memory;
                if (!pushStack(&stack, &sp, b)) return .out_of_memory;
            },
            '$' => {
                _ = popStack(&stack, &sp);
            },
            '.' => {
                const v = popStack(&stack, &sp);
                var num_buf: [32]u8 = undefined;
                const formatted = std.fmt.bufPrint(&num_buf, "{d} ", .{v}) catch {
                    setError("Integer format overflow");
                    return .@"error";
                };
                if (written + formatted.len > out_cap) {
                    setError("Output buffer capacity exceeded");
                    return .invalid_param;
                }
                @memcpy(out_buf[written .. written + formatted.len], formatted);
                written += @intCast(formatted.len);
            },
            ',' => {
                const v = popStack(&stack, &sp);
                if (written >= out_cap) {
                    setError("Output buffer capacity exceeded");
                    return .invalid_param;
                }
                out_buf[written] = @intCast(@mod(v, 256));
                written += 1;
            },
            '#' => {
                skip_next = true;
            },
            'g' => {
                const y = popStack(&stack, &sp);
                const x = popStack(&stack, &sp);
                const cell_val: i64 = if (y >= 0 and y < 10 and x >= 0 and x < 10) blk: {
                    const idx: usize = @as(usize, @intCast(y)) * 10 + @as(usize, @intCast(x));
                    break :blk @intCast(if (allow_self_mod) mut_grid[idx] else grid_bytes[idx]);
                } else 0;
                if (!pushStack(&stack, &sp, cell_val)) return .out_of_memory;
            },
            'p' => {
                const y = popStack(&stack, &sp);
                const x = popStack(&stack, &sp);
                const v = popStack(&stack, &sp);
                if (allow_self_mod and y >= 0 and y < 10 and x >= 0 and x < 10) {
                    const idx: usize = @as(usize, @intCast(y)) * 10 + @as(usize, @intCast(x));
                    mut_grid[idx] = @intCast(@mod(v, 256));
                }
            },
            '@' => {
                out_len.* = written;
                out_halted.* = 1;
                clearError();
                return .ok;
            },
            else => {},
        }

        advanceCoord(&r, &c, dir);
        if (skip_next) {
            advanceCoord(&r, &c, dir);
        }
    }

    out_len.* = written;
    out_halted.* = 0;
    clearError();
    return .ok;
}

/// Execute an arbitrary 10x10 (100-byte) Befunge-93 torus grid up to `max_steps`.
export fn befunge93_vault_cracker_eval_grid(
    handle: ?*Handle,
    grid_ptr: ?[*]const u8,
    grid_len: u32,
    max_steps: u32,
    out_buf: ?[*]u8,
    out_cap: u32,
    out_len: ?*u32,
    out_halted: ?*u32,
) Result {
    const h = handle orelse {
        setError("Null handle");
        return .null_pointer;
    };
    const g_ptr = grid_ptr orelse {
        setError("Null grid_ptr");
        return .null_pointer;
    };
    const buf = out_buf orelse {
        setError("Null out_buf");
        return .null_pointer;
    };
    const len_ptr = out_len orelse {
        setError("Null out_len");
        return .null_pointer;
    };
    const halt_ptr = out_halted orelse {
        setError("Null out_halted");
        return .null_pointer;
    };
    if (!h.initialized) {
        setError("Handle not initialized");
        return .@"error";
    }
    if (grid_len != 100) {
        setError("grid_len must be exactly 100 bytes (10x10)");
        return .invalid_param;
    }

    const grid_fixed: *const [100]u8 = g_ptr[0..100];
    const has_put = std.mem.indexOfScalar(u8, grid_fixed, 'p') != null;
    return executeGrid10x10(grid_fixed, max_steps, buf, out_cap, len_ptr, halt_ptr, has_put);
}

/// Execute the canonical 10x10 Befunge-93 vault grid natively in Zig and write
/// the recovered passcode into `out_buf`.
export fn befunge93_vault_cracker_run_vault(
    handle: ?*Handle,
    out_buf: ?[*]u8,
    out_cap: u32,
    out_len: ?*u32,
) Result {
    const h = handle orelse {
        setError("Null handle");
        return .null_pointer;
    };
    const buf = out_buf orelse {
        setError("Null out_buf");
        return .null_pointer;
    };
    const len_ptr = out_len orelse {
        setError("Null out_len");
        return .null_pointer;
    };
    if (!h.initialized) {
        setError("Handle not initialized");
        return .@"error";
    }
    if (out_cap < 8) {
        setError("Output buffer capacity must be >= 8 bytes");
        return .invalid_param;
    }

    var halted: u32 = 0;
    const rc = executeGrid10x10(CANONICAL_GRID[0..100], 500, buf, out_cap, len_ptr, &halted, false);
    if (rc != .ok) return rc;
    if (halted == 0) {
        setError("Vault VM exceeded step budget");
        return .@"error";
    }
    return .ok;
}

export fn befunge93_vault_cracker_last_error() ?[*:0]const u8 {
    const err = last_error orelse return null;
    return err.ptr;
}

export fn befunge93_vault_cracker_version() [*:0]const u8 {
    return VERSION.ptr;
}

export fn befunge93_vault_cracker_build_info() [*:0]const u8 {
    return BUILD_INFO.ptr;
}

test "lifecycle" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);
    try std.testing.expectEqual(@as(u32, 1), befunge93_vault_cracker_is_initialized(handle));
}

test "error handling on null handle" {
    var out: [8]u8 = undefined;
    var out_len: u32 = 0;
    const result = befunge93_vault_cracker_run_vault(null, &out, out.len, &out_len);
    try std.testing.expectEqual(Result.null_pointer, result);
    try std.testing.expect(befunge93_vault_cracker_last_error() != null);
}

test "version" {
    const ver = std.mem.span(befunge93_vault_cracker_version());
    try std.testing.expectEqualStrings(VERSION, ver);
}

test "vault grid execution yields 98261047" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);

    var out: [16]u8 = undefined;
    var out_len: u32 = 0;
    const rc = befunge93_vault_cracker_run_vault(handle, &out, out.len, &out_len);
    try std.testing.expectEqual(Result.ok, rc);
    try std.testing.expectEqual(@as(u32, 8), out_len);
    try std.testing.expectEqualStrings("98261047", out[0..out_len]);
}

test "eval_grid executes self-modifying g and p opcodes on arbitrary 10x10 grid" {
    const handle = befunge93_vault_cracker_init() orelse return error.InitFailed;
    defer befunge93_vault_cracker_free(handle);

    const self_mod_grid =
        "^v\"6802\"< " ++
        " >76g34pv\\" ++
        ">   v   < " ++
        "^   :     " ++
        "^   _$   v" ++
        " #======# " ++
        " |PATCH,| " ++
        " |g&p-VM| " ++
        " #======# " ++
        ">0\"4175\"v@";

    var out: [32]u8 = undefined;
    var out_len: u32 = 0;
    var halted: u32 = 0;
    const rc = befunge93_vault_cracker_eval_grid(
        handle,
        self_mod_grid.ptr,
        100,
        500,
        &out,
        out.len,
        &out_len,
        &halted,
    );
    try std.testing.expectEqual(Result.ok, rc);
    try std.testing.expectEqual(@as(u32, 1), halted);
    try std.testing.expectEqualStrings("68025714", out[0..out_len]);
}
