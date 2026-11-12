# Anatomy figure

The 3D demonstrator shows an écorché (a figure with the skin removed, muscles visible) performing
each exercise, with the working muscles highlighted. This replaces the primitive mannequin, which
remains as the loading state and the fallback if the model fails to load.

## Pieces

| Path | Role |
| --- | --- |
| `tools/anatomy/build_figure.py` | Blender script: Z-Anatomy atlas → skinned GLB |
| `tools/anatomy/inspect_blend.py` | Dumps the atlas's object/collection tree to JSON |
| `public/models/ecorche.glb` | The built, compressed model (~2 MB) |
| `src/components/three/body.ts` | `BodyHandle` contract shared by both bodies; pose → joint rotations |
| `src/components/three/anatomy-body.tsx` | Loads the GLB, drives its bones, measures it, paints muscles |
| `src/components/three/procedural-body.tsx` | Primitive mannequin: loading state and fallback |
| `src/components/three/fibre-material.ts` | Matte PBR material with procedural muscle-fibre relief |
| `src/components/three/demonstrator.tsx` | Frame loop: poses the body, pins pads/handles/bar/cables to joints |

## How the model is built

Source: Z-Anatomy atlas (`Startup.blend`, CC BY-SA 4.0, derived from BodyParts3D).

```sh
Blender -b --disable-autoexec Startup.blend --python tools/anatomy/build_figure.py -- out.glb report.json
npx @gltf-transform/cli@4.5.1 meshopt out.glb public/models/ecorche.glb --quantization-volume scene
```

1. **Select** muscles, tendon insertions and bones. Skip text labels (single-letter suffixes such
   as `.g`, `.j`; `.l`/`.r` are body sides), fasciae, bursae and internal organs' muscles.
2. **Visibility**: cast rays from ~120 directions; drop parts never seen from outside. Muscles with
   under 12% of their surface in view are deep layers: keep them (they fill gaps in the layer
   above) but inset them 3 mm so they don't poke through when posed.
3. **Group** each muscle into Spotter's muscle groups (`src/lib/exercise/muscles.ts`).
4. **Decimate** to a 200k-triangle budget shared by surface area, with a 300-triangle floor per part.
5. **Fix mirrored parts**: the atlas builds the left side as negative-scale mirrors; baking the
   transform turns faces inside out, so their normals are flipped back.
6. **Fibre UVs**: `u` counts fibres, `v` is metres along the muscle. Round muscles wrap `u` around
   their long axis; flat sheets lay it straight across the sheet.
7. **Armature** from bone landmarks (hip, knee, ankle, shoulder, elbow, wrist, spine points).
8. **Skinning via a proxy body**: voxel-remesh every part into one watertight body, weight it with
   Blender's bone-heat solver, sharpen the weights (power 1.6), then give every vertex the weights of the
   nearest proxy surface. Touching muscles share one smooth weight field, so they cannot tear apart.
9. **Join** by muscle group and export (Y up, facing +Z, feet on the floor, 1.78 m tall).
10. **Compress** with meshopt. The quantization volume must be scene-wide: per-mesh volumes put
    offsets on node transforms, which glTF ignores for skinned meshes.

The script also saves the rigged `.blend` next to `report.json` (never in `public/`).

## Runtime

- `AnatomyBody` measures the loaded model (leg lengths, seat and back offsets, grip point) from the
  **skinned** rest shape, because the compressed file stores quantized positions.
- Both bodies implement `BodyHandle` (`apply(pose, …)`, `frame(joint)`), so the demonstrator and
  equipment code don't care which body is mounted.
- Materials: one per role (primary, secondary, idle, tendon), roughness 0.75–0.85, faint fibre
  relief that fades out before it can alias. Colours come from `--scene-*` / `--plate*` tokens.

## Verifying a build

- Rest pose: render front/back/side/close-chest in Blender (Workbench) and look for holes.
- Posed: in the app, lat pulldown front and back views, seated row back view, dark theme.
- `npm run typecheck && npm run lint && npm test`.

## Open questions

- **Licence**: Z-Anatomy is CC BY-SA 4.0. The app needs a visible attribution line, and the
  ShareAlike terms likely cover the model file. Where the credit goes is undecided.
- **Model in git**: the ~2 MB GLB is committed in `public/models/`. Revisit (Git LFS or a CDN) if
  it grows or gets rebuilt often.

## Changes

### 2026-11-12: First version

**Result.** Figure loads and poses on every machine. Problems found on review and fixed:
the 337 MB `.blend` was being saved into `public/`; meshopt per-mesh quantization broke skinning;
runtime measurements read quantized positions and floated the figure; fibre striations aliased
into zebra stripes; materials were glossy and read as plastic; per-muscle skinning tore muscles
apart when posed; the left half rendered inside out (mirrored parts); a "SKELETAL SYSTEM" text
label was exported as geometry.

### 2026-11-12: Back slits, smeared thighs, lat striping

> Written after the build was started; from here on docs come first.

**Problem.** Posed views still show (1) small dark slits on the upper back, (2) thin, smeared
thighs in the front view when the hips are bent 90°, (3) faint zigzag fibre striping on the lats.

**Plan.**
1. Slits: deep muscles survive the visibility pass because a few rays reach them through gaps, then
   poke through the trapezius when posed. Measure the share of each muscle's surface hit by rays and
   drop muscles under 12%. Log what is dropped.
2. Thighs: the bone-heat blend between pelvis and thigh is wide, so linear skinning averages the
   thigh toward the pelvis. Raise proxy weights to the power 1.6 and renormalise to narrow blends.
3. Striping: the wrap-around fibre UV is meaningless on flat sheets. Detect sheets from the
   SVD (second spread > 2.5 × third) and lay fibres straight across them.

**How we'll check it.** Dropped-muscle list contains only deep layers (e.g. rhomboids, splenius,
serratus posterior), never trapezius, lats, deltoids or pectorals. Same three posed screenshots as
before, compared side by side.

**Result.** Regression; the app was rolled back to the previous model.
- Sheet UVs worked: the lats are smooth, no zigzag.
- Thighs read fuller in the front view.
- Dropping deep muscles (105 dropped) was wrong. It removed the upper-back slits but opened a hole
  where the rhomboids had been filling a real gap under the trapezius, a hole at the front of the
  neck, and also dropped muscles that should stay: rectus abdominis (a coincident sheath steals its
  ray hits), serratus anterior, adductor magnus.
- New artefact: grey blades stick out of both sides of the torso, armpit to hip, in every view.
  Cause not yet isolated: either the dropped layers changed the proxy body, or the weight sharpening.

### 2026-11-12: Inset deep muscles instead of dropping them

**Problem.** Deep muscles poke through the surface layer when posed (slits), but they also fill gaps
in it, so removing them opens holes. The torso-side blades from the last build are unexplained.

**Plan.**
1. Keep every muscle. Instead, push muscles with under 12% of their surface in view 3 mm inward
   along their vertex normals, so they sit behind the layer above them when posed but still fill
   gaps. Keep logging which muscles are inset.
2. Keep weight sharpening (1.6) and sheet UVs from the last build.
3. This also isolates the blades: the proxy body is back to the full set of muscles, so if the
   blades remain, weight sharpening caused them; if they go, the dropped layers did.

**How we'll check it.** Same three posed screenshots. No hole in the upper back or neck; abs,
serratus and adductors present; no slits; no torso blades; lats still smooth.

**Result.** Kept; this is the current `public/models/ecorche.glb` (225k triangles, 2.0 MB).
- 105 deep muscles inset, none dropped. Upper back is clean in the lat pulldown back view: no slits,
  no hole. Abs, serratus and neck are back.
- The torso blades are gone, so the dropped layers caused them (the proxy body lost its fill around
  the ribcage), not the weight sharpening, which stays.
- Lats stay smooth.
- Still open: a few small dark dashes on the trapezius in the seated row; in the lat pulldown front
  view the legs, foreshortened under the knee pads, read as a narrow shape at the front of the seat.
  Both are minor next to the earlier problems.
