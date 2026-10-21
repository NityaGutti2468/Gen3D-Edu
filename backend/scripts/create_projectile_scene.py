"""Build the reusable projectile-motion base scene and export a browser-ready GLB.

Run with Blender 4.2+: blender --background --python backend/scripts/create_projectile_scene.py
The learner-specific trajectory and projectile positions come from AnimationPlan
and are applied by the React Three Fiber viewer; this file creates only the
static scene assets shared by every projectile-motion lesson.
"""

from pathlib import Path

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT = PROJECT_ROOT / "frontend" / "public" / "scenes" / "projectile-motion.glb"


def _linear_channel(value: int) -> float:
    channel = value / 255
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: str, metallic: float, roughness: float):
    color = (*(_linear_channel(int(hex_color[i:i + 2], 16)) for i in (1, 3, 5)), 1)
    mat = bpy.data.materials.new(name=name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def make_box(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft edge", "BEVEL")
    bevel.width = 0.12
    bevel.segments = 3
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    ground_mat = material("Ground · slate", "#0E1726", 0, 0.92)
    stand_mat = material("Launch stand · blue", "#294978", 0.24, 0.48)
    ball_mat = material("Projectile · amber", "#FFC66D", 0.08, 0.32)
    apex_mat = material("Trajectory apex · violet", "#B5A2FF", 0.02, 0.38)

    # Blender is Z-up; the glTF exporter converts this to glTF's Y-up axes.
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(500, 0, 0))
    ground = bpy.context.object
    ground.name = "Ground"
    ground.data.materials.append(ground_mat)

    make_box("LaunchPlatform", (-1.8, 0, 0.06), (2.4, 1.7, 0.12), stand_mat)
    make_box("LaunchPost", (-1.8, 0, 0.48), (0.22, 0.28, 0.85), stand_mat)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.42, location=(0, 0, 0))
    projectile = bpy.context.object
    projectile.name = "Projectile"
    projectile.data.materials.append(ball_mat)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=(0, 0, 0))
    apex_marker = bpy.context.object
    apex_marker.name = "ApexMarker"
    apex_marker.data.materials.append(apex_mat)
    bpy.ops.object.shade_smooth()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=False, export_apply=True)
    print(f"Exported projectile-motion GLB: {OUTPUT}")


if __name__ == "__main__":
    main()
