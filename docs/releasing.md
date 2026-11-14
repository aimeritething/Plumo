# Releasing Plumo

A release is a dmg for Apple Silicon Macs on GitHub Releases, signed with the Developer ID
certificate and notarized by Apple, plus the files an installed Plumo reads to update
itself. A pushed tag builds all of it into a draft; a person publishes the draft.

## Once: the credentials

Run the wizard from the repository root. It walks through each step and writes the
secrets straight into the repository's GitHub Actions secrets:

```bash
scripts/setup-release-credentials.sh
```

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | The Developer ID Application certificate with its private key and Apple's Developer ID G2 intermediate certificate, as a base64 `.p12`, and the password of that file. Without the intermediate, `codesign` cannot build the chain and fails with `errSecInternalComponent`. |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, `Developer ID Application: … (TEAMID)`. |
| `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8` | The App Store Connect API key that submits the build for notarization: Issuer ID, Key ID, and the `.p8` file's contents. |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The updater key that signs each Update, and its password. |

The wizard also writes the updater's public key into `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`); commit that change.

The updater key cannot be replaced. An installed Plumo accepts only an Update signed with
the key whose public half it was built with, so if the private key or its password is lost,
every installed copy stops updating and its user has to download Plumo again by hand. Keep
both in a password manager. The Apple certificate and API key can be revoked and made
again at any time.

## Each release

1. Write the version's section in `CHANGELOG.md`: a `## <version>` heading, then the
   changes under `### Added`, `### Improved` and `### Fixed`, one line each, in English, in
   words a user would recognise. This section becomes the release notes on GitHub and the
   text in the Update popover. Merge it to `main`.
2. On an up-to-date `main` with a clean working tree, cut the version:

   ```bash
   pnpm release 0.1.0-beta.2
   ```

   This writes the version into `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/Cargo.lock`, commits it as `release: v0.1.0-beta.2` and tags that commit. It
   refuses when the changelog section is missing or the tag exists.
3. Push the commit and the tag. This is what starts the release workflow:

   ```bash
   git push --follow-tags
   ```

4. Wait for the Release workflow (about 15 minutes; notarization is most of it). It ends
   with a draft release holding `Plumo_<version>_aarch64.dmg`, the updater archive
   `Plumo_<version>_aarch64.app.tar.gz` with its `.sig`, and `latest.json`.
5. Download the dmg from the draft and check it: it opens without a Gatekeeper warning,
   Plumo opens a Folder, an edit saves, Rich and Raw switch, and double-clicking a `.md`
   file in Finder opens it in Plumo.
6. Publish the draft, leaving "Set as the latest release" ticked and "Set as a pre-release"
   unticked, beta versions included. From that moment installed copies find the Update on
   their next check.

## How an installed Plumo updates

Plumo reads `https://github.com/aimeritething/Plumo/releases/latest/download/latest.json`
ten seconds after launch and every 24 hours after that. GitHub's "latest" skips drafts and
pre-releases, which is why a beta is published as a normal release with "beta" in its
version, and why nothing reaches users while a release is still a draft. There is one
channel: every installed copy moves to the newest published version.

A newer version is downloaded and its signature checked in the background. Then the Update
button appears; its popover shows the changelog section, and Restart and Update runs the
quit sequence (every pending edit is written first), installs, and reopens Plumo. A
development build (`pnpm tauri dev`) never checks.

## If something goes wrong

- **The workflow fails at "The tag matches the version".** The tag was made by hand or the
  changelog section is missing. Delete the tag (`git tag -d v… && git push origin :v…`),
  fix it, and cut the version again.
- **Signing or notarization fails.** The log of "Build, sign and notarize" has Apple's
  reason. A revoked or expired certificate or API key is replaced by running the wizard
  again. Re-run the workflow from the Actions page; the tag does not need to move.
- **A published release is bad.** Do not delete it: copies that already updated cannot go
  back. Cut the next version with the fix; every copy moves to it within a day.
- **The draft is bad.** Delete the draft and the tag, fix, and cut the same version again.
  No user has seen a draft.
