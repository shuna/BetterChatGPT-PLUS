# zstd (Zstandard) - Vendored C Library

- **Version**: 1.5.6
- **License**: BSD (see individual source files)
- **Source**: https://github.com/facebook/zstd
- **Included**: common/, compress/, decompress/ (core library only)
- **Excluded**: dictBuilder/, legacy/, deprecated/, dll/

## Usage
Import via `module.modulemap` in the `include/` directory.
Xcode project must add the C source files from `lib/` to the build target.
