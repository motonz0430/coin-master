import bpy
import math
from mathutils import Vector
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DESIGN_DIR = ROOT / "design" / "dragon-column"
ASSET_DIR = ROOT / "assets" / "resources" / "models" / "dragon-column"
BLEND_PATH = DESIGN_DIR / "dragon-column.blend"
PREVIEW_PATH = DESIGN_DIR / "dragon-column-preview.png"
GLB_PATH = ASSET_DIR / "dragon-column.glb"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def make_material(name, color, metallic=0.0, roughness=0.5, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = (*emission, 1.0)
        principled.inputs["Emission Strength"].default_value = 4.0
    return material


def mark_asset(obj, material):
    obj.data.materials.append(material)
    obj["game_asset"] = True
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def apply_bevel(obj, width=0.015, segments=1):
    modifier = obj.modifiers.new("Edge bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def cylinder(name, radius, depth, z, material, vertices=14, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    mark_asset(obj, material)
    if bevel:
        apply_bevel(obj, bevel, 1)
    return smooth(obj)


def ico(name, location, scale, material, subdivisions=2, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mark_asset(obj, material)
    return smooth(obj)


def cone_between(name, start, end, base_radius, material, vertices=6):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    length = direction.length
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=base_radius,
        radius2=0.003,
        depth=length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mark_asset(obj, material)
    return smooth(obj)


def tube_mesh(name, points, radii, material, sides=10):
    vertices = []
    faces = []
    for index, point in enumerate(points):
        point = Vector(point)
        if index == 0:
            tangent = Vector(points[1]) - point
        elif index == len(points) - 1:
            tangent = point - Vector(points[index - 1])
        else:
            tangent = Vector(points[index + 1]) - Vector(points[index - 1])
        tangent.normalize()

        radial = Vector((point.x, point.y, 0))
        if radial.length < 0.001:
            radial = Vector((1, 0, 0))
        radial.normalize()
        second = tangent.cross(radial).normalized()

        for side in range(sides):
            angle = math.tau * side / sides
            offset = radial * math.cos(angle) + second * math.sin(angle)
            vertices.append(tuple(point + offset * radii[index]))

    for ring in range(len(points) - 1):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            c = (ring + 1) * sides + (side + 1) % sides
            d = (ring + 1) * sides + side
            faces.append((a, b, c, d))

    faces.append(tuple(reversed(range(sides))))
    last = (len(points) - 1) * sides
    faces.append(tuple(last + side for side in range(sides)))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mark_asset(obj, material)
    return smooth(obj)


def wing(name, side, material):
    x = 1 if side > 0 else -1
    vertices = [
        (0.17 * x, -0.04, 0.68),
        (0.30 * x, -0.01, 0.93),
        (0.47 * x, -0.03, 0.78),
        (0.50 * x, -0.06, 0.40),
        (0.40 * x, -0.10, 0.22),
        (0.31 * x, -0.11, 0.43),
        (0.25 * x, -0.09, 0.30),
        (0.22 * x, -0.07, 0.56),
    ]
    faces = [(0, 1, 7), (1, 2, 7), (2, 3, 6, 7), (3, 4, 5, 6)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mark_asset(obj, material)

    solidify = obj.modifiers.new("Wing thickness", "SOLIDIFY")
    solidify.thickness = 0.016
    bevel = obj.modifiers.new("Wing edge bevel", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    cone_between(name + "UpperBone", vertices[0], vertices[1], 0.018, material, 6)
    cone_between(name + "OuterBone", vertices[1], vertices[3], 0.014, material, 6)
    return obj


def claw_cluster(name, location, outward, dragon_material, horn_material):
    location = Vector(location)
    outward = Vector(outward).normalized()
    palm = ico(name + "Palm", location, (0.085, 0.07, 0.065), dragon_material, 1)
    tangent = Vector((-outward.y, outward.x, 0))
    for index, spread in enumerate((-0.055, 0.0, 0.055)):
        start = location + tangent * spread + outward * 0.045
        tip = start + outward * (0.11 + 0.015 * (index == 1)) + tangent * spread * 0.35 - Vector((0, 0, 0.035))
        cone_between(f"{name}Talon{index + 1}", start, tip, 0.018, horn_material, 7)
    return palm


def join_by_material():
    joined = []
    material_groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.get("game_asset"):
            continue
        material_name = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        material_groups.setdefault(material_name, []).append(obj)

    for material_name, objects in material_groups.items():
        if len(objects) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            result = bpy.context.object
        else:
            result = objects[0]
        result.name = material_name.replace(" ", "_")
        result["game_asset"] = True
        joined.append(result)
    return joined


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


clear_scene()
ASSET_DIR.mkdir(parents=True, exist_ok=True)
DESIGN_DIR.mkdir(parents=True, exist_ok=True)

stone = make_material("Stone", (0.055, 0.065, 0.085), metallic=0.05, roughness=0.68)
stone_edge = make_material("StoneEdge", (0.11, 0.13, 0.17), metallic=0.12, roughness=0.52)
dragon = make_material("DragonScale", (0.025, 0.035, 0.06), metallic=0.46, roughness=0.32)
horn = make_material("HornClaw", (0.15, 0.17, 0.22), metallic=0.65, roughness=0.24)
mouth = make_material("Mouth", (0.11, 0.018, 0.025), metallic=0.0, roughness=0.5)
eye = make_material("EyeGlow", (0.55, 0.72, 0.95), metallic=0.0, roughness=0.16, emission=(0.35, 0.62, 1.0))

# Stone pillar core, base and cap. Overall asset bounds are approximately radius 0.5 and height 2.
cylinder("PillarCore", 0.285, 1.76, 0.0, stone, 14, 0.018)
cylinder("PillarBase", 0.375, 0.14, -0.91, stone_edge, 14, 0.012)
cylinder("PillarFoot", 0.42, 0.08, -0.98, stone, 14, 0.008)
cylinder("PillarCap", 0.375, 0.14, 0.91, stone_edge, 14, 0.012)
cylinder("PillarTop", 0.42, 0.08, 0.98, stone, 14, 0.008)

# Main serpentine body: 2.35 compact turns around the pillar.
helix_points = []
helix_radii = []
helix_steps = 50
turns = 2.35
for index in range(helix_steps):
    t = index / (helix_steps - 1)
    angle = -math.pi * 0.5 + math.tau * turns * t
    radius = 0.34 + 0.012 * math.sin(t * math.tau * 2)
    z = -0.78 + 1.48 * t
    helix_points.append((math.cos(angle) * radius, math.sin(angle) * radius, z))
    helix_radii.append(0.085 + 0.035 * t)
tube_mesh("CoiledDragonBody", helix_points, helix_radii, dragon, sides=8)

# Tail blade.
tail_start = Vector(helix_points[0])
tail_direction = Vector((tail_start.x, tail_start.y, -0.96)).normalized()
cone_between("TailBlade", tail_start, tail_start + tail_direction * 0.22, 0.07, dragon, 6)

# Dorsal spikes along the coil.
for index in range(6, helix_steps - 8, 7):
    point = Vector(helix_points[index])
    radial = Vector((point.x, point.y, 0)).normalized()
    start = point + radial * helix_radii[index] * 0.65
    tip = start + radial * (0.075 + 0.012 * (index % 3)) + Vector((0, 0, 0.025))
    cone_between(f"BodySpike{index:02d}", start, tip, 0.025, horn, 5)

# Dragon head, open jaw and eyes on the upper-front of the pillar.
ico("DragonHead", (0, -0.39, 0.63), (0.19, 0.245, 0.17), dragon, 2)
ico("BrowLeft", (-0.075, -0.57, 0.67), (0.075, 0.07, 0.055), dragon, 1, (0, 0.1, 0.08))
ico("BrowRight", (0.075, -0.57, 0.67), (0.075, 0.07, 0.055), dragon, 1, (0, -0.1, -0.08))
ico("UpperSnout", (0, -0.59, 0.57), (0.125, 0.15, 0.075), dragon, 1)
ico("MouthInterior", (0, -0.585, 0.485), (0.105, 0.125, 0.07), mouth, 1)
ico("LowerJaw", (0, -0.56, 0.43), (0.115, 0.14, 0.055), dragon, 1, (0.16, 0, 0))
ico("EyeLeft", (-0.071, -0.645, 0.65), (0.025, 0.018, 0.016), eye, 2)
ico("EyeRight", (0.071, -0.645, 0.65), (0.025, 0.018, 0.016), eye, 2)

# Horns curve backward in two low-poly segments.
for side in (-1, 1):
    cone_between(f"Horn{side}A", (0.075 * side, -0.43, 0.75), (0.13 * side, -0.34, 0.88), 0.045, horn, 6)
    cone_between(f"Horn{side}B", (0.13 * side, -0.34, 0.88), (0.17 * side, -0.25, 0.97), 0.035, horn, 6)

# Short crown spikes.
for index, x in enumerate((-0.12, -0.06, 0.0, 0.06, 0.12)):
    cone_between(f"CrownSpike{index}", (x, -0.39, 0.72), (x * 1.18, -0.30, 0.82 + 0.055 * (1 - abs(x) / 0.12 if x else 1)), 0.027, horn, 5)

# Teeth.
for row, z_start, z_tip in (("Upper", 0.535, 0.47), ("Lower", 0.455, 0.51)):
    for index, x in enumerate((-0.072, -0.036, 0.0, 0.036, 0.072)):
        cone_between(f"{row}Tooth{index}", (x, -0.705, z_start), (x, -0.71, z_tip), 0.011, horn, 5)

# Compact bat wings and supporting bones.
wing("WingLeft", -1, dragon)
wing("WingRight", 1, dragon)

# Four gripping claw clusters.
claw_cluster("UpperClawLeft", (-0.29, -0.28, 0.35), (-0.65, -0.76, -0.12), dragon, horn)
claw_cluster("UpperClawRight", (0.29, -0.28, 0.35), (0.65, -0.76, -0.12), dragon, horn)
claw_cluster("LowerClawLeft", (-0.30, -0.06, -0.46), (-0.88, -0.42, -0.18), dragon, horn)
claw_cluster("LowerClawRight", (0.30, -0.06, -0.46), (0.88, -0.42, -0.18), dragon, horn)

# Reduce draw calls by joining all pieces that share a material.
asset_objects = join_by_material()

# Export only the five material groups as a compact GLB.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = asset_objects[0]
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
)

# Add a lightweight preview rig after export so it is not included in the game asset.
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -1.035))
ground = bpy.context.object
ground.name = "PreviewGround"
ground_material = make_material("PreviewGroundMaterial", (0.12, 0.13, 0.15), roughness=0.9)
ground.data.materials.append(ground_material)

bpy.ops.object.light_add(type="AREA", location=(-3.2, -4.0, 4.5))
key = bpy.context.object
key.data.energy = 1050
key.data.shape = "DISK"
key.data.size = 4.0
look_at(key, (0, 0, 0.15))

bpy.ops.object.light_add(type="AREA", location=(3.0, 0.2, 2.5))
rim = bpy.context.object
rim.data.energy = 850
rim.data.color = (0.30, 0.46, 0.75)
rim.data.size = 3.0
look_at(rim, (0, 0, 0.25))

bpy.ops.object.camera_add(location=(3.0, -4.2, 2.25))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.75
look_at(camera, (0, 0, 0.05))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.render.film_transparent = False
scene.world.color = (0.018, 0.022, 0.03)
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)

triangles = sum(len(obj.data.polygons) for obj in asset_objects if obj.type == "MESH")
print(f"DRAGON_MODEL_OK glb={GLB_PATH} blend={BLEND_PATH} preview={PREVIEW_PATH} polygons={triangles} draw_groups={len(asset_objects)}")
