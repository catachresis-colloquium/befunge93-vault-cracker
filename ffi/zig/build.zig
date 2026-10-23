// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// Build configuration for Befunge-93 Vault Cracker Zig FFI (Zig 0.15.2+ / 0.17+).

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const ffi_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });

    const lib_shared = b.addLibrary(.{
        .linkage = .dynamic,
        .name = "befunge93_vault_cracker",
        .root_module = ffi_mod,
        .version = .{ .major = 0, .minor = 2, .patch = 0 },
    });
    b.installArtifact(lib_shared);

    const lib_static = b.addLibrary(.{
        .linkage = .static,
        .name = "befunge93_vault_cracker",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        }),
    });
    b.installArtifact(lib_static);

    const header = b.addInstallHeaderFile(
        b.path("include/befunge93_vault_cracker.h"),
        "befunge93_vault_cracker.h",
    );
    b.getInstallStep().dependOn(&header.step);

    const unit_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        }),
    });

    const integration_mod = b.createModule(.{
        .root_source_file = b.path("test/integration_test.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    integration_mod.linkLibrary(lib_static);

    const integration_tests = b.addTest(.{
        .root_module = integration_mod,
    });

    const test_step = b.step("test", "Run FFI unit and C-ABI integration tests");
    test_step.dependOn(&b.addRunArtifact(unit_tests).step);
    test_step.dependOn(&b.addRunArtifact(integration_tests).step);

    const lib_bench_static = b.addLibrary(.{
        .linkage = .static,
        .name = "befunge93_vault_cracker_bench_lib",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = .ReleaseFast,
            .link_libc = true,
        }),
    });

    const bench_mod = b.createModule(.{
        .root_source_file = b.path("bench/bench.zig"),
        .target = target,
        .optimize = .ReleaseFast,
        .link_libc = true,
    });
    bench_mod.linkLibrary(lib_bench_static);

    const bench_exe = b.addExecutable(.{
        .name = "befunge93_vault_cracker_bench",
        .root_module = bench_mod,
    });
    const bench_step = b.step("bench", "Run native Zig FFI vault benchmark");
    bench_step.dependOn(&b.addRunArtifact(bench_exe).step);
}
