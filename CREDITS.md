# Credits

## Wind Rider

Based on the VIScon 2026 Hackathon entry by **Team 16**.

Continued development by Stella with Claude.

## Assets

Everything in the game is generated at load time (terrain, plants,
structures, gates, particles, sea life) except the two models below.

### 3D Models
- **Paper Airplane** by kilansky (CC BY 4.0)
  https://sketchfab.com/3d-models/paper-airplane-29aa6a99e1d24b52a9d7d9eb2695bdb8
  The pilot (`frontend/public/models/pilot.glb`): kilansky's folds, rebuilt in
  Blender with a layered paper thickness and recoloured cream; the glow is ours

- **Jellyfish** by chinabazooka (CC BY 4.0)
  https://skfb.ly/6RLJD
  The Sunken Reef jellyfish (`frontend/public/models/jellyfish.glb`, decimated
  from 27k to 3.4k triangles, textures reduced to 512px luminance); the pulse,
  colours and the discharge are ours

### Audio
- Wind, gate rings, countdown and crash sounds are synthesized (Web Audio API)
- Wingbeat sample and the five music tracks are original to the hackathon project

### Fonts
- Cinzel Variable — SIL Open Font License
- Plus Jakarta Sans Variable — SIL Open Font License
- Philosopher — SIL Open Font License

### Tools and libraries
- Three.js — MIT License
- React — MIT License
- simplex-noise — MIT License
- lil-gui (the `?tune` panel) — MIT License
- Tabler Icons — MIT License
- FastAPI, uvicorn, Pydantic — MIT License
- Caddy — Apache License 2.0
- Blender (bpy) — GPL, used for the asset pipeline only
