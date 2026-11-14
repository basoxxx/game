import{Vector3 as w,CanvasTexture as F,PlaneGeometry as k,MeshBasicMaterial as M,InstancedMesh as z,Object3D as Y,InstancedBufferGeometry as S,InstancedBufferAttribute as f,ShaderMaterial as T,DoubleSide as A,UniformsUtils as C,UniformsLib as R,Mesh as P,TextureLoader as K,SRGBColorSpace as D,CircleGeometry as E,Color as h,Vector4 as y}from"./three.module-DDguy-kI.js";import{a2 as O}from"./index-Bf27NNCn.js";const U=[{id:"fir_sapling_medium_0",kind:"conifer",slot:0,S:9.003,h:8.826,scale:1.5},{id:"fir_sapling_medium_1",kind:"conifer",slot:1,S:7.951,h:7.795,scale:1.6},{id:"fir_sapling_medium_2",kind:"conifer",slot:2,S:6.025,h:5.907,scale:1.8},{id:"pine_sapling_small_0",kind:"conifer",slot:3,S:1.067,h:1.046,scale:3},{id:"pine_sapling_small_1",kind:"conifer",slot:4,S:1.325,h:1.299,scale:3},{id:"pine_sapling_small_2",kind:"conifer",slot:5,S:.981,h:.961,scale:3},{id:"searsia_lucida_0",kind:"broad",slot:6,S:2.386,h:2.339,scale:2.6},{id:"searsia_lucida_1",kind:"broad",slot:7,S:2.034,h:1.994,scale:2.8},{id:"searsia_lucida_2",kind:"broad",slot:8,S:1.713,h:1.68,scale:3.2},{id:"searsia_burchellii_0",kind:"broad",slot:9,S:5.25,h:3.239,scale:2.2},{id:"searsia_burchellii_1",kind:"broad",slot:10,S:3.718,h:2.587,scale:2.2},{id:"searsia_burchellii_2",kind:"broad",slot:11,S:2.364,h:1.936,scale:2.4},{id:"shrub_02_0",kind:"bush",slot:12,S:2.201,h:2.158,scale:1},{id:"shrub_02_2",kind:"bush",slot:13,S:2.637,h:2.382,scale:1},{id:"quiver_tree_02_0",kind:"desert",slot:14,S:1.498,h:1.469,scale:1.6},{id:"othonna_cerarioides_0",kind:"desert",slot:15,S:2.009,h:1.97,scale:1.5}],G="./assets/veg/";let m=null,x=null;function q(){const n=O()==="high";return m&&x===n||(x=n,m=new K().load(G+(n?"trees.webp":"trees_half.webp")),m.colorSpace=D,m.anisotropy=4,m.generateMipmaps=!0),m}function X(n){return U.filter(s=>n.includes(s.kind))}const H=`
  attribute vec3 iPos; attribute float iScale; attribute float iSlot; attribute float iRot; attribute vec3 iTint;
  uniform vec3 sunDir;
  varying vec2 vUv; varying vec3 vTint; varying float vShade; varying float vTop;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec3 toCam = cameraPosition - iPos;
    vec2 d = normalize(toCam.xz + vec2(1e-4));
    vec3 right = vec3(d.y, 0.0, -d.x);
    // tilt the quad slightly towards high cameras so trees do not look paper-thin from above
    float up = clamp(toCam.y / max(1.0, length(toCam.xz)), 0.0, 1.5);
    vec3 fwd = vec3(d.x, 0.0, d.y);
    vec3 wp = iPos + right * position.x * iScale + vec3(0.0, position.y * iScale, 0.0) + fwd * position.y * iScale * up * 0.35;
    float a = atan(d.x, d.y) - iRot;
    float f = mod(floor(a / 6.2831853 * 8.0 + 0.5), 8.0);
    float vc = mod(f, 4.0), vr = floor(f / 4.0);
    float col = mod(iSlot, 4.0), row = floor(iSlot / 4.0);
    float px = col * 1024.0 + vc * 256.0 + (position.x + 0.5) * 256.0;
    float pyTop = row * 512.0 + vr * 256.0 + (1.0 - position.y) * 256.0;
    vUv = vec2(px / 4096.0, 1.0 - pyTop / 2048.0);
    vTint = iTint;
    // seen from high above the side view gives way to the crown seen from the top (canopy mesh)
    vTop = smoothstep(0.4, 0.72, toCam.y / max(1.0, length(toCam)));
    // lit from the sun side: the half of the crown facing the sun is brighter, the top catches more light
    float sl = dot(right.xz, normalize(sunDir.xz + vec2(1e-4)));
    vShade = (0.7 + 0.3 * position.y) * (1.0 + 0.34 * sl * position.x * 2.0);
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`,I=`
  uniform sampler2D map; uniform float light; uniform float gain;
  varying vec2 vUv; varying vec3 vTint; varying float vShade; varying float vTop;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec4 c = texture2D(map, vUv);
    // keep thin foliage alive in the distance: mip levels average alpha down, so boost it
    vec2 tx = vUv * vec2(ATLAS_W, ATLAS_W * 0.5);
    float lod = log2(max(1.0, max(length(dFdx(tx)), length(dFdy(tx)))));
    float a = c.a * (1.0 + lod * 0.7);
    if (a < 0.42) discard;
    #ifdef CANOPY
      if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < vTop) discard;
    #endif
    gl_FragColor = vec4(c.rgb * vTint * vShade * light * gain, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`,L={conifer:0,broad:1,bush:2,desert:3},b=[[.2,.55],[.34,.62],[.46,.5],[.3,.62]],N=`
  attribute vec3 iPos; attribute float iH; attribute float iKind; attribute vec3 iTint; attribute float iRot;
  uniform vec3 sunDir; uniform vec4 kR, kY;
  varying vec2 vP; varying vec3 vTint; varying float vShade; varying float vTop; varying float vKind;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    int k = int(iKind + 0.5);
    float R = (k == 0 ? kR.x : k == 1 ? kR.y : k == 2 ? kR.z : kR.w) * iH, Y = (k == 0 ? kY.x : k == 1 ? kY.y : k == 2 ? kY.z : kY.w) * iH;
    vec2 p = position.xy; float r2 = dot(p, p);
    float c = cos(iRot), s = sin(iRot); p = mat2(c, -s, s, c) * p;
    vec3 wp = iPos + vec3(p.x * R, Y + (1.0 - r2) * R * 0.45, p.y * R);
    vec3 n = normalize(vec3(p.x, 1.2 * (1.0 - r2) + 0.3, p.y));
    vShade = 0.55 + 0.55 * max(0.0, dot(n, normalize(sunDir)));
    vec3 toCam = cameraPosition - wp;
    vTop = smoothstep(0.4, 0.72, toCam.y / max(1.0, length(toCam)));
    vP = position.xy * (R * 0.9) + iPos.xz * 0.37; vTint = iTint; vKind = iKind;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`,B=`
  uniform float light; uniform vec3 kc0, kc1, kc2, kc3;
  varying vec2 vP; varying vec3 vTint; varying float vShade; varying float vTop; varying float vKind;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  float ch(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  // leaf clumps: distance to jittered points of a cell grid
  float clumps(vec2 p) { vec2 i = floor(p), f = fract(p); float d = 1.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 q = o + vec2(ch(i + o), ch(i + o + 7.1)) - f; d = min(d, dot(q, q)); } return sqrt(d); }
  void main() {
    #include <logdepthbuf_fragment>
    if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) >= vTop) discard;
    float cl = clumps(vP * 0.9), cl2 = clumps(vP * 2.3 + 3.0);
    int k = int(vKind + 0.5);
    vec3 base = k == 0 ? kc0 : k == 1 ? kc1 : k == 2 ? kc2 : kc3;
    float lum = (1.0 - cl * 0.8) * 0.75 + (1.0 - cl2) * 0.35;
    gl_FragColor = vec4(base * vTint * vShade * (0.45 + 0.75 * lum) * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;function W(n,s){const r=n.length,v=new E(1,14),o=v.attributes.position;for(let e=1;e<o.count;e++){const l=.85+.25*Math.abs(Math.sin(e*2.7));o.setXY(e,o.getX(e)*l,o.getY(e)*l)}const a=new S;a.index=v.index,a.attributes.position=v.attributes.position;const c=new Float32Array(r*3),u=new Float32Array(r),p=new Float32Array(r),t=new Float32Array(r),d=new Float32Array(r*3);n.forEach((e,l)=>{c.set([e.x,e.y||0,e.z],l*3),u[l]=e.h,p[l]=L[e.meta.kind]??1,t[l]=e.rot||0,d.set(e.tint||[1,1,1],l*3)}),a.setAttribute("iPos",new f(c,3)),a.setAttribute("iH",new f(u,1)),a.setAttribute("iKind",new f(p,1)),a.setAttribute("iRot",new f(t,1)),a.setAttribute("iTint",new f(d,3)),a.instanceCount=r;const i=new T({uniforms:C.merge([R.fog,{kR:{value:new y(...b.map(e=>e[0]))},kY:{value:new y(...b.map(e=>e[1]))},kc0:{value:new h(2901030)},kc1:{value:new h(4744750)},kc2:{value:new h(5664826)},kc3:{value:new h(7040832)}}]),vertexShader:N,fragmentShader:B,fog:!0,side:A});i.uniforms.light=s.uniforms.light,i.uniforms.sunDir=s.uniforms.sunDir;const g=new P(a,i);return g.frustumCulled=!1,g}function J(n,s={}){const r=n.length,v=new k(1,1).translate(0,.5,0),o=new S;o.index=v.index,o.attributes.position=v.attributes.position,o.attributes.uv=v.attributes.uv;const a=new Float32Array(r*3),c=new Float32Array(r),u=new Float32Array(r),p=new Float32Array(r),t=new Float32Array(r*3);n.forEach((e,l)=>{a.set([e.x,e.y||0,e.z],l*3);const _=e.meta;c[l]=_.S*(e.h/_.h),u[l]=_.slot,p[l]=e.rot||0,t.set(e.tint||[1,1,1],l*3)}),o.setAttribute("iPos",new f(a,3)),o.setAttribute("iScale",new f(c,1)),o.setAttribute("iSlot",new f(u,1)),o.setAttribute("iRot",new f(p,1)),o.setAttribute("iTint",new f(t,3)),o.instanceCount=r;const d=q(),i=new T({uniforms:C.merge([R.fog,{map:{value:null},light:{value:1},gain:{value:1.4},sunDir:{value:new w(.55,.62,.45)}}]),vertexShader:H,fragmentShader:I.replace(/ATLAS_W/g,x?"4096.0":"2048.0"),fog:!0,side:A});i.uniforms.map.value=d,s.canopy&&(i.defines={CANOPY:1});const g=new P(o,i);return g.frustumCulled=!1,s.canopy&&g.add(W(n,i)),g}function Q(n,s=new w(.45,1,.3)){const r=new F((()=>{const t=document.createElement("canvas");t.width=t.height=64;const d=t.getContext("2d"),i=d.createRadialGradient(32,32,0,32,32,32);return i.addColorStop(0,"rgba(0,0,0,0.55)"),i.addColorStop(.6,"rgba(0,0,0,0.25)"),i.addColorStop(1,"rgba(0,0,0,0)"),d.fillStyle=i,d.fillRect(0,0,64,64),t})()),v=new k(1,1).rotateX(-Math.PI/2),o=new M({map:r,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2}),a=new z(v,o,n.length),c=new Y,u=-s.x/s.y,p=-s.z/s.y;return n.forEach((t,d)=>{const i=Math.max(2,t.h*(t.meta.kind==="conifer"?.5:.8));c.position.set(t.x+u*t.h*.25,(t.y||0)+.05,t.z+p*t.h*.25),c.scale.set(i*1.3,1,i),c.rotation.y=Math.atan2(u,p),c.updateMatrix(),a.setMatrixAt(d,c.matrix)}),a.renderOrder=-1,a}export{J as a,Q as m,X as v};
