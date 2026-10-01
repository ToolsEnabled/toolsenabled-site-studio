# Source and state compatibility

Site Studio derives from the static web-editor source. It retains the original fourteen editing/read tool names and adds named checkpoints and preview discovery. Mutation schemas require expected_rev. Arbitrary source-range replacement and embedded provider integrations are outside this product.

Saved state uses a canonical, code-unit-sorted export fingerprint. When opening an older state without that fingerprint marker, migration verifies the stored digest against the original or saved snapshots using the supported legacy collations before converting it. It never replaces a mismatched digest with the current original's digest. If verification fails, reopen using the previous locale or recover the working copy into a new state directory. Original drift remains an export refusal.

The initial restore target is retained separately from pruned undo history. Older state can migrate when a revision-zero snapshot is available in its current model, undo/redo or checkpoints. Otherwise startup refuses with a recovery message: preserve that state and recover the working copy before starting a new state directory. Existing agent labels that do not meet the label rules become numbered imported checkpoints; migrated timeline entries identify actor and type.

Filename collision keys use NFC normalization and the bundled Unicode 15.0 full case-fold mapping, generated from Python's Unicode database. Default-ignorable characters, format characters and C1 controls are refused. Directory and file names use the same collision rules. Local filesystems are required; Windows and macOS filesystem behavior still requires platform qualification.
