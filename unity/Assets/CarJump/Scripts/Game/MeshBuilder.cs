using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarJump
{
    /// Çok alt-meshli basit mesh oluşturucu. Üretilen her şeyi az sayıda çizim çağrısına toplar (mobil için).
    public class MeshBuilder
    {
        public readonly List<Vector3> verts = new List<Vector3>();
        public readonly List<Vector3> normals = new List<Vector3>();
        public readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<List<int>> subs = new List<List<int>>();

        public MeshBuilder(int subMeshes = 1) { for (int i = 0; i < subMeshes; i++) subs.Add(new List<int>()); }

        public int Add(Vector3 p, Vector2 uv, Vector3 n = default)
        {
            verts.Add(p); uvs.Add(uv); normals.Add(n);
            return verts.Count - 1;
        }

        public void Tri(int a, int b, int c, int sub = 0) { var l = subs[sub]; l.Add(a); l.Add(b); l.Add(c); }
        public void Quad(int a, int b, int c, int d, int sub = 0) { Tri(a, b, c, sub); Tri(a, c, d, sub); }

        /// Izgara dörtgeni: a=(i,j) b=(i+1,j) c=(i+1,j+1) d=(i,j+1); x ileri, z yana artarken yüzey yukarı bakar.
        public void GridQuadUp(int a, int b, int c, int d, int sub = 0) { Tri(a, c, b, sub); Tri(a, d, c, sub); }

        /// İstenen yöne bakan dörtgen (köşe sırası gerekirse çevrilir).
        public void QuadFacing(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, Vector3 facing, int sub = 0, float uMax = 1, float vMax = 1)
        {
            var n = Vector3.Cross(p1 - p0, p2 - p0);
            if (Vector3.Dot(n, facing) < 0) { var t = p1; p1 = p3; p3 = t; }
            n = Vector3.Cross(p1 - p0, p2 - p0).normalized;
            int a = Add(p0, new Vector2(0, 0), n), b = Add(p1, new Vector2(0, vMax), n), c = Add(p2, new Vector2(uMax, vMax), n), d = Add(p3, new Vector2(uMax, 0), n);
            Quad(a, b, c, d, sub);
        }

        /// Düz gölgeli üçgen (her üçgen kendi köşelerine sahip).
        public void FlatTri(Vector3 a, Vector3 b, Vector3 c, int sub = 0)
        {
            var n = Vector3.Cross(b - a, c - a).normalized;
            int i = Add(a, new Vector2(a.x, a.z) * 0.1f, n), j = Add(b, new Vector2(b.x, b.z) * 0.1f, n), k = Add(c, new Vector2(c.x, c.z) * 0.1f, n);
            Tri(i, j, k, sub);
        }

        /// Dönüştürülmüş bir kutu ekler (yerel birim küp -0.5..0.5).
        public void Box(Matrix4x4 m, int sub = 0)
        {
            Vector3[] c =
            {
                new Vector3(-.5f, -.5f, -.5f), new Vector3(.5f, -.5f, -.5f), new Vector3(.5f, .5f, -.5f), new Vector3(-.5f, .5f, -.5f),
                new Vector3(-.5f, -.5f, .5f), new Vector3(.5f, -.5f, .5f), new Vector3(.5f, .5f, .5f), new Vector3(-.5f, .5f, .5f),
            };
            int[][] faces = { new[] { 0, 3, 2, 1 }, new[] { 4, 5, 6, 7 }, new[] { 0, 4, 7, 3 }, new[] { 1, 2, 6, 5 }, new[] { 3, 7, 6, 2 }, new[] { 0, 1, 5, 4 } };
            foreach (var f in faces)
            {
                var p0 = m.MultiplyPoint3x4(c[f[0]]); var p1 = m.MultiplyPoint3x4(c[f[1]]);
                var p2 = m.MultiplyPoint3x4(c[f[2]]); var p3 = m.MultiplyPoint3x4(c[f[3]]);
                var n = Vector3.Cross(p1 - p0, p2 - p0).normalized;
                int a = Add(p0, new Vector2(0, 0), n), b = Add(p1, new Vector2(0, 1), n), d = Add(p2, new Vector2(1, 1), n), e = Add(p3, new Vector2(1, 0), n);
                Quad(a, b, d, e, sub);
            }
        }

        public Mesh Build(string name, bool recalcNormals = false)
        {
            var mesh = new Mesh { name = name, indexFormat = verts.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = subs.Count;
            for (int i = 0; i < subs.Count; i++) mesh.SetTriangles(subs[i], i);
            if (recalcNormals) mesh.RecalculateNormals(); else mesh.SetNormals(normals);
            mesh.RecalculateBounds();
            return mesh;
        }

        public static GameObject Spawn(string name, Transform parent, Mesh mesh, Material[] mats, bool castShadows = false, bool receiveShadows = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = mats;
            mr.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.receiveShadows = receiveShadows;
            return go;
        }
    }
}
