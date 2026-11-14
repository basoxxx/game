import{DataTextureLoader as Lt,HalfFloatType as I,FloatType as ie,DataUtils as Se,LinearSRGBColorSpace as vt,LinearFilter as _e,Vector2 as F,WebGLRenderTarget as me,Texture as lt,NearestFilter as Le,UniformsUtils as Q,ShaderMaterial as J,Vector3 as B,Matrix4 as ze,DataTexture as ht,RepeatWrapping as xe,NoBlending as K,MeshNormalMaterial as Ct,AddEquation as we,ZeroFactor as Me,DstAlphaFactor as ct,DstColorFactor as dt,CustomBlending as Nt,Color as re,DepthTexture as $e,DepthStencilFormat as Rt,UnsignedInt248Type as Ut,RGBAFormat as Ot,UnsignedByteType as Wt,Matrix3 as Ft,TextureLoader as Bt,ShaderChunk as Vt,EquirectangularReflectionMapping as jt,MeshStandardMaterial as et,FogExp2 as Ht,MathUtils as pt,SRGBColorSpace as Gt}from"./three.module-DDguy-kI.js";import{P as mt,F as xt,C as qe,E as It,R as Xt,S as te,U as kt,O as Yt}from"./OutputPass-xkU-WUvX.js";import{V as qt,a2 as Zt}from"./index-Bf27NNCn.js";class Kt extends Lt{constructor(e){super(e),this.type=I}parse(e){const r=function(f,v){switch(f){case 1:throw new Error("THREE.RGBELoader: Read Error: "+(v||""));case 2:throw new Error("THREE.RGBELoader: Write Error: "+(v||""));case 3:throw new Error("THREE.RGBELoader: Bad File Format: "+(v||""));default:case 4:throw new Error("THREE.RGBELoader: Memory Error: "+(v||""))}},T=function(f,v,h){v=v||1024;let x=f.pos,A=-1,g=0,C="",D=String.fromCharCode.apply(null,new Uint16Array(f.subarray(x,x+128)));for(;0>(A=D.indexOf(`
`))&&g<v&&x<f.byteLength;)C+=D,g+=D.length,x+=128,D+=String.fromCharCode.apply(null,new Uint16Array(f.subarray(x,x+128)));return-1<A?(f.pos+=g+A+1,C+D.slice(0,A)):!1},y=function(f){const v=/^#\?(\S+)/,h=/^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/,p=/^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/,x=/^\s*FORMAT=(\S+)\s*$/,A=/^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/,g={valid:0,string:"",comments:"",programtype:"RGBE",format:"",gamma:1,exposure:1,width:0,height:0};let C,D;for((f.pos>=f.byteLength||!(C=T(f)))&&r(1,"no header found"),(D=C.match(v))||r(3,"bad initial token"),g.valid|=1,g.programtype=D[1],g.string+=C+`
`;C=T(f),C!==!1;){if(g.string+=C+`
`,C.charAt(0)==="#"){g.comments+=C+`
`;continue}if((D=C.match(h))&&(g.gamma=parseFloat(D[1])),(D=C.match(p))&&(g.exposure=parseFloat(D[1])),(D=C.match(x))&&(g.valid|=2,g.format=D[1]),(D=C.match(A))&&(g.valid|=4,g.height=parseInt(D[1],10),g.width=parseInt(D[2],10)),g.valid&2&&g.valid&4)break}return g.valid&2||r(3,"missing format specifier"),g.valid&4||r(3,"missing image size specifier"),g},c=function(f,v,h){const p=v;if(p<8||p>32767||f[0]!==2||f[1]!==2||f[2]&128)return new Uint8Array(f);p!==(f[2]<<8|f[3])&&r(3,"wrong scanline width");const x=new Uint8Array(4*v*h);x.length||r(4,"unable to allocate buffer space");let A=0,g=0;const C=4*p,D=new Uint8Array(4),V=new Uint8Array(C);let X=h;for(;X>0&&g<f.byteLength;){g+4>f.byteLength&&r(1),D[0]=f[g++],D[1]=f[g++],D[2]=f[g++],D[3]=f[g++],(D[0]!=2||D[1]!=2||(D[2]<<8|D[3])!=p)&&r(3,"bad rgbe scanline format");let R=0,U;for(;R<C&&g<f.byteLength;){U=f[g++];const O=U>128;if(O&&(U-=128),(U===0||R+U>C)&&r(3,"bad scanline data"),O){const W=f[g++];for(let $=0;$<U;$++)V[R++]=W}else V.set(f.subarray(g,g+U),R),R+=U,g+=U}const G=p;for(let O=0;O<G;O++){let W=0;x[A]=V[O+W],W+=p,x[A+1]=V[O+W],W+=p,x[A+2]=V[O+W],W+=p,x[A+3]=V[O+W],A+=4}X--}return x},S=function(f,v,h,p){const x=f[v+3],A=Math.pow(2,x-128)/255;h[p+0]=f[v+0]*A,h[p+1]=f[v+1]*A,h[p+2]=f[v+2]*A,h[p+3]=1},m=function(f,v,h,p){const x=f[v+3],A=Math.pow(2,x-128)/255;h[p+0]=Se.toHalfFloat(Math.min(f[v+0]*A,65504)),h[p+1]=Se.toHalfFloat(Math.min(f[v+1]*A,65504)),h[p+2]=Se.toHalfFloat(Math.min(f[v+2]*A,65504)),h[p+3]=Se.toHalfFloat(1)},w=new Uint8Array(e);w.pos=0;const u=y(w),z=u.width,E=u.height,M=c(w.subarray(w.pos),z,E);let P,N,L;switch(this.type){case ie:L=M.length/4;const f=new Float32Array(L*4);for(let h=0;h<L;h++)S(M,h*4,f,h*4);P=f,N=ie;break;case I:L=M.length/4;const v=new Uint16Array(L*4);for(let h=0;h<L;h++)m(M,h*4,v,h*4);P=v,N=I;break;default:throw new Error("THREE.RGBELoader: Unsupported type: "+this.type)}return{width:z,height:E,data:P,header:u.string,gamma:u.gamma,exposure:u.exposure,type:N}}setDataType(e){return this.type=e,this}load(e,t,a,i){function s(r,n){switch(r.type){case ie:case I:r.colorSpace=vt,r.minFilter=_e,r.magFilter=_e,r.generateMipmaps=!1,r.flipY=!0;break}t&&t(r,n)}return super.load(e,s,a,i)}}const Te={defines:{SMAA_THRESHOLD:"0.1"},uniforms:{tDiffuse:{value:null},resolution:{value:new F(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];

		void SMAAEdgeDetectionVS( vec2 texcoord ) {
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -1.0, 0.0, 0.0,  1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4(  1.0, 0.0, 0.0, -1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 2 ] = texcoord.xyxy + resolution.xyxy * vec4( -2.0, 0.0, 0.0,  2.0 ); // WebGL port note: Changed sign in W component
		}

		void main() {

			vUv = uv;

			SMAAEdgeDetectionVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];

		vec4 SMAAColorEdgeDetectionPS( vec2 texcoord, vec4 offset[3], sampler2D colorTex ) {
			vec2 threshold = vec2( SMAA_THRESHOLD, SMAA_THRESHOLD );

			// Calculate color deltas:
			vec4 delta;
			vec3 C = texture2D( colorTex, texcoord ).rgb;

			vec3 Cleft = texture2D( colorTex, offset[0].xy ).rgb;
			vec3 t = abs( C - Cleft );
			delta.x = max( max( t.r, t.g ), t.b );

			vec3 Ctop = texture2D( colorTex, offset[0].zw ).rgb;
			t = abs( C - Ctop );
			delta.y = max( max( t.r, t.g ), t.b );

			// We do the usual threshold:
			vec2 edges = step( threshold, delta.xy );

			// Then discard if there is no edge:
			if ( dot( edges, vec2( 1.0, 1.0 ) ) == 0.0 )
				discard;

			// Calculate right and bottom deltas:
			vec3 Cright = texture2D( colorTex, offset[1].xy ).rgb;
			t = abs( C - Cright );
			delta.z = max( max( t.r, t.g ), t.b );

			vec3 Cbottom  = texture2D( colorTex, offset[1].zw ).rgb;
			t = abs( C - Cbottom );
			delta.w = max( max( t.r, t.g ), t.b );

			// Calculate the maximum delta in the direct neighborhood:
			float maxDelta = max( max( max( delta.x, delta.y ), delta.z ), delta.w );

			// Calculate left-left and top-top deltas:
			vec3 Cleftleft  = texture2D( colorTex, offset[2].xy ).rgb;
			t = abs( C - Cleftleft );
			delta.z = max( max( t.r, t.g ), t.b );

			vec3 Ctoptop = texture2D( colorTex, offset[2].zw ).rgb;
			t = abs( C - Ctoptop );
			delta.w = max( max( t.r, t.g ), t.b );

			// Calculate the final maximum delta:
			maxDelta = max( max( maxDelta, delta.z ), delta.w );

			// Local contrast adaptation in action:
			edges.xy *= step( 0.5 * maxDelta, delta.xy );

			return vec4( edges, 0.0, 0.0 );
		}

		void main() {

			gl_FragColor = SMAAColorEdgeDetectionPS( vUv, vOffset, tDiffuse );

		}`},ye={defines:{SMAA_MAX_SEARCH_STEPS:"8",SMAA_AREATEX_MAX_DISTANCE:"16",SMAA_AREATEX_PIXEL_SIZE:"( 1.0 / vec2( 160.0, 560.0 ) )",SMAA_AREATEX_SUBTEX_SIZE:"( 1.0 / 7.0 )"},uniforms:{tDiffuse:{value:null},tArea:{value:null},tSearch:{value:null},resolution:{value:new F(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];
		varying vec2 vPixcoord;

		void SMAABlendingWeightCalculationVS( vec2 texcoord ) {
			vPixcoord = texcoord / resolution;

			// We will use these offsets for the searches later on (see @PSEUDO_GATHER4):
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.25, 0.125, 1.25, 0.125 ); // WebGL port note: Changed sign in Y and W components
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.125, 0.25, -0.125, -1.25 ); // WebGL port note: Changed sign in Y and W components

			// And these for the searches, they indicate the ends of the loops:
			vOffset[ 2 ] = vec4( vOffset[ 0 ].xz, vOffset[ 1 ].yw ) + vec4( -2.0, 2.0, -2.0, 2.0 ) * resolution.xxyy * float( SMAA_MAX_SEARCH_STEPS );

		}

		void main() {

			vUv = uv;

			SMAABlendingWeightCalculationVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		#define SMAASampleLevelZeroOffset( tex, coord, offset ) texture2D( tex, coord + float( offset ) * resolution, 0.0 )

		uniform sampler2D tDiffuse;
		uniform sampler2D tArea;
		uniform sampler2D tSearch;
		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[3];
		varying vec2 vPixcoord;

		#if __VERSION__ == 100
		vec2 round( vec2 x ) {
			return sign( x ) * floor( abs( x ) + 0.5 );
		}
		#endif

		float SMAASearchLength( sampler2D searchTex, vec2 e, float bias, float scale ) {
			// Not required if searchTex accesses are set to point:
			// float2 SEARCH_TEX_PIXEL_SIZE = 1.0 / float2(66.0, 33.0);
			// e = float2(bias, 0.0) + 0.5 * SEARCH_TEX_PIXEL_SIZE +
			//     e * float2(scale, 1.0) * float2(64.0, 32.0) * SEARCH_TEX_PIXEL_SIZE;
			e.r = bias + e.r * scale;
			return 255.0 * texture2D( searchTex, e, 0.0 ).r;
		}

		float SMAASearchXLeft( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			/**
				* @PSEUDO_GATHER4
				* This texcoord has been offset by (-0.25, -0.125) in the vertex shader to
				* sample between edge, thus fetching four edges in a row.
				* Sampling with different offsets in each direction allows to disambiguate
				* which edges are active from the four fetched ones.
				*/
			vec2 e = vec2( 0.0, 1.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord -= vec2( 2.0, 0.0 ) * resolution;
				if ( ! ( texcoord.x > end && e.g > 0.8281 && e.r == 0.0 ) ) break;
			}

			// We correct the previous (-0.25, -0.125) offset we applied:
			texcoord.x += 0.25 * resolution.x;

			// The searches are bias by 1, so adjust the coords accordingly:
			texcoord.x += resolution.x;

			// Disambiguate the length added by the last step:
			texcoord.x += 2.0 * resolution.x; // Undo last step
			texcoord.x -= resolution.x * SMAASearchLength(searchTex, e, 0.0, 0.5);

			return texcoord.x;
		}

		float SMAASearchXRight( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 0.0, 1.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord += vec2( 2.0, 0.0 ) * resolution;
				if ( ! ( texcoord.x < end && e.g > 0.8281 && e.r == 0.0 ) ) break;
			}

			texcoord.x -= 0.25 * resolution.x;
			texcoord.x -= resolution.x;
			texcoord.x -= 2.0 * resolution.x;
			texcoord.x += resolution.x * SMAASearchLength( searchTex, e, 0.5, 0.5 );

			return texcoord.x;
		}

		float SMAASearchYUp( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 1.0, 0.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord += vec2( 0.0, 2.0 ) * resolution; // WebGL port note: Changed sign
				if ( ! ( texcoord.y > end && e.r > 0.8281 && e.g == 0.0 ) ) break;
			}

			texcoord.y -= 0.25 * resolution.y; // WebGL port note: Changed sign
			texcoord.y -= resolution.y; // WebGL port note: Changed sign
			texcoord.y -= 2.0 * resolution.y; // WebGL port note: Changed sign
			texcoord.y += resolution.y * SMAASearchLength( searchTex, e.gr, 0.0, 0.5 ); // WebGL port note: Changed sign

			return texcoord.y;
		}

		float SMAASearchYDown( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 1.0, 0.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord -= vec2( 0.0, 2.0 ) * resolution; // WebGL port note: Changed sign
				if ( ! ( texcoord.y < end && e.r > 0.8281 && e.g == 0.0 ) ) break;
			}

			texcoord.y += 0.25 * resolution.y; // WebGL port note: Changed sign
			texcoord.y += resolution.y; // WebGL port note: Changed sign
			texcoord.y += 2.0 * resolution.y; // WebGL port note: Changed sign
			texcoord.y -= resolution.y * SMAASearchLength( searchTex, e.gr, 0.5, 0.5 ); // WebGL port note: Changed sign

			return texcoord.y;
		}

		vec2 SMAAArea( sampler2D areaTex, vec2 dist, float e1, float e2, float offset ) {
			// Rounding prevents precision errors of bilinear filtering:
			vec2 texcoord = float( SMAA_AREATEX_MAX_DISTANCE ) * round( 4.0 * vec2( e1, e2 ) ) + dist;

			// We do a scale and bias for mapping to texel space:
			texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + ( 0.5 * SMAA_AREATEX_PIXEL_SIZE );

			// Move to proper place, according to the subpixel offset:
			texcoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

			return texture2D( areaTex, texcoord, 0.0 ).rg;
		}

		vec4 SMAABlendingWeightCalculationPS( vec2 texcoord, vec2 pixcoord, vec4 offset[ 3 ], sampler2D edgesTex, sampler2D areaTex, sampler2D searchTex, ivec4 subsampleIndices ) {
			vec4 weights = vec4( 0.0, 0.0, 0.0, 0.0 );

			vec2 e = texture2D( edgesTex, texcoord ).rg;

			if ( e.g > 0.0 ) { // Edge at north
				vec2 d;

				// Find the distance to the left:
				vec2 coords;
				coords.x = SMAASearchXLeft( edgesTex, searchTex, offset[ 0 ].xy, offset[ 2 ].x );
				coords.y = offset[ 1 ].y; // offset[1].y = texcoord.y - 0.25 * resolution.y (@CROSSING_OFFSET)
				d.x = coords.x;

				// Now fetch the left crossing edges, two at a time using bilinear
				// filtering. Sampling at -0.25 (see @CROSSING_OFFSET) enables to
				// discern what value each edge has:
				float e1 = texture2D( edgesTex, coords, 0.0 ).r;

				// Find the distance to the right:
				coords.x = SMAASearchXRight( edgesTex, searchTex, offset[ 0 ].zw, offset[ 2 ].y );
				d.y = coords.x;

				// We want the distances to be in pixel units (doing this here allow to
				// better interleave arithmetic and memory accesses):
				d = d / resolution.x - pixcoord.x;

				// SMAAArea below needs a sqrt, as the areas texture is compressed
				// quadratically:
				vec2 sqrt_d = sqrt( abs( d ) );

				// Fetch the right crossing edges:
				coords.y -= 1.0 * resolution.y; // WebGL port note: Added
				float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 1, 0 ) ).r;

				// Ok, we know how this pattern looks like, now it is time for getting
				// the actual area:
				weights.rg = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.y ) );
			}

			if ( e.r > 0.0 ) { // Edge at west
				vec2 d;

				// Find the distance to the top:
				vec2 coords;

				coords.y = SMAASearchYUp( edgesTex, searchTex, offset[ 1 ].xy, offset[ 2 ].z );
				coords.x = offset[ 0 ].x; // offset[1].x = texcoord.x - 0.25 * resolution.x;
				d.x = coords.y;

				// Fetch the top crossing edges:
				float e1 = texture2D( edgesTex, coords, 0.0 ).g;

				// Find the distance to the bottom:
				coords.y = SMAASearchYDown( edgesTex, searchTex, offset[ 1 ].zw, offset[ 2 ].w );
				d.y = coords.y;

				// We want the distances to be in pixel units:
				d = d / resolution.y - pixcoord.y;

				// SMAAArea below needs a sqrt, as the areas texture is compressed
				// quadratically:
				vec2 sqrt_d = sqrt( abs( d ) );

				// Fetch the bottom crossing edges:
				coords.y -= 1.0 * resolution.y; // WebGL port note: Added
				float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 0, 1 ) ).g;

				// Get the area for this direction:
				weights.ba = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.x ) );
			}

			return weights;
		}

		void main() {

			gl_FragColor = SMAABlendingWeightCalculationPS( vUv, vPixcoord, vOffset, tDiffuse, tArea, tSearch, ivec4( 0.0 ) );

		}`},Ze={uniforms:{tDiffuse:{value:null},tColor:{value:null},resolution:{value:new F(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 2 ];

		void SMAANeighborhoodBlendingVS( vec2 texcoord ) {
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -1.0, 0.0, 0.0, 1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4( 1.0, 0.0, 0.0, -1.0 ); // WebGL port note: Changed sign in W component
		}

		void main() {

			vUv = uv;

			SMAANeighborhoodBlendingVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform sampler2D tColor;
		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 2 ];

		vec4 SMAANeighborhoodBlendingPS( vec2 texcoord, vec4 offset[ 2 ], sampler2D colorTex, sampler2D blendTex ) {
			// Fetch the blending weights for current pixel:
			vec4 a;
			a.xz = texture2D( blendTex, texcoord ).xz;
			a.y = texture2D( blendTex, offset[ 1 ].zw ).g;
			a.w = texture2D( blendTex, offset[ 1 ].xy ).a;

			// Is there any blending weight with a value greater than 0.0?
			if ( dot(a, vec4( 1.0, 1.0, 1.0, 1.0 )) < 1e-5 ) {
				return texture2D( colorTex, texcoord, 0.0 );
			} else {
				// Up to 4 lines can be crossing a pixel (one through each edge). We
				// favor blending by choosing the line with the maximum weight for each
				// direction:
				vec2 offset;
				offset.x = a.a > a.b ? a.a : -a.b; // left vs. right
				offset.y = a.g > a.r ? -a.g : a.r; // top vs. bottom // WebGL port note: Changed signs

				// Then we go in the direction that has the maximum weight:
				if ( abs( offset.x ) > abs( offset.y )) { // horizontal vs. vertical
					offset.y = 0.0;
				} else {
					offset.x = 0.0;
				}

				// Fetch the opposite color and lerp by hand:
				vec4 C = texture2D( colorTex, texcoord, 0.0 );
				texcoord += sign( offset ) * resolution;
				vec4 Cop = texture2D( colorTex, texcoord, 0.0 );
				float s = abs( offset.x ) > abs( offset.y ) ? abs( offset.x ) : abs( offset.y );

				// WebGL port note: Added gamma correction
				C.xyz = pow(C.xyz, vec3(2.2));
				Cop.xyz = pow(Cop.xyz, vec3(2.2));
				vec4 mixed = mix(C, Cop, s);
				mixed.xyz = pow(mixed.xyz, vec3(1.0 / 2.2));

				return mixed;
			}
		}

		void main() {

			gl_FragColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );

		}`};class Qt extends mt{constructor(e,t){super(),this.edgesRT=new me(e,t,{depthBuffer:!1,type:I}),this.edgesRT.texture.name="SMAAPass.edges",this.weightsRT=new me(e,t,{depthBuffer:!1,type:I}),this.weightsRT.texture.name="SMAAPass.weights";const a=this,i=new Image;i.src=this.getAreaTexture(),i.onload=function(){a.areaTexture.needsUpdate=!0},this.areaTexture=new lt,this.areaTexture.name="SMAAPass.area",this.areaTexture.image=i,this.areaTexture.minFilter=_e,this.areaTexture.generateMipmaps=!1,this.areaTexture.flipY=!1;const s=new Image;s.src=this.getSearchTexture(),s.onload=function(){a.searchTexture.needsUpdate=!0},this.searchTexture=new lt,this.searchTexture.name="SMAAPass.search",this.searchTexture.image=s,this.searchTexture.magFilter=Le,this.searchTexture.minFilter=Le,this.searchTexture.generateMipmaps=!1,this.searchTexture.flipY=!1,this.uniformsEdges=Q.clone(Te.uniforms),this.uniformsEdges.resolution.value.set(1/e,1/t),this.materialEdges=new J({defines:Object.assign({},Te.defines),uniforms:this.uniformsEdges,vertexShader:Te.vertexShader,fragmentShader:Te.fragmentShader}),this.uniformsWeights=Q.clone(ye.uniforms),this.uniformsWeights.resolution.value.set(1/e,1/t),this.uniformsWeights.tDiffuse.value=this.edgesRT.texture,this.uniformsWeights.tArea.value=this.areaTexture,this.uniformsWeights.tSearch.value=this.searchTexture,this.materialWeights=new J({defines:Object.assign({},ye.defines),uniforms:this.uniformsWeights,vertexShader:ye.vertexShader,fragmentShader:ye.fragmentShader}),this.uniformsBlend=Q.clone(Ze.uniforms),this.uniformsBlend.resolution.value.set(1/e,1/t),this.uniformsBlend.tDiffuse.value=this.weightsRT.texture,this.materialBlend=new J({uniforms:this.uniformsBlend,vertexShader:Ze.vertexShader,fragmentShader:Ze.fragmentShader}),this.fsQuad=new xt(null)}render(e,t,a){this.uniformsEdges.tDiffuse.value=a.texture,this.fsQuad.material=this.materialEdges,e.setRenderTarget(this.edgesRT),this.clear&&e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.materialWeights,e.setRenderTarget(this.weightsRT),this.clear&&e.clear(),this.fsQuad.render(e),this.uniformsBlend.tColor.value=a.texture,this.fsQuad.material=this.materialBlend,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(),this.fsQuad.render(e))}setSize(e,t){this.edgesRT.setSize(e,t),this.weightsRT.setSize(e,t),this.materialEdges.uniforms.resolution.value.set(1/e,1/t),this.materialWeights.uniforms.resolution.value.set(1/e,1/t),this.materialBlend.uniforms.resolution.value.set(1/e,1/t)}getAreaTexture(){return"data:image/png;base64,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"}getSearchTexture(){return"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEIAAAAhCAAAAABIXyLAAAAAOElEQVRIx2NgGAWjYBSMglEwEICREYRgFBZBqDCSLA2MGPUIVQETE9iNUAqLR5gIeoQKRgwXjwAAGn4AtaFeYLEAAAAASUVORK5CYII="}dispose(){this.edgesRT.dispose(),this.weightsRT.dispose(),this.areaTexture.dispose(),this.searchTexture.dispose(),this.materialEdges.dispose(),this.materialWeights.dispose(),this.materialBlend.dispose(),this.fsQuad.dispose()}}const Ae={defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new F},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new ze},cameraProjectionMatrixInverse:{value:new ze},cameraWorldMatrix:{value:new ze},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new B(-1,-1,-1)},sceneBoxMax:{value:new B(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;		
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif
		
		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
			vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {  
			return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;
		}

		float fetchDepth(const ivec2 uv) {   
			return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}
		
		void main() {
			float depth = getDepth(vUv.xy);
			if (depth >= 1.0) {
				discard;
				return;
			}
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif
			
			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {
				
				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w); 
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				vec3 viewDir = normalize(-viewPos.xyz);
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));
				
				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));
				
				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);	

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}		

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);		
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}`},De={defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},Ke={uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function Jt(o=5){const e=Math.floor(o)%2===0?Math.floor(o)+1:Math.floor(o),t=_t(e),a=t.length,i=new Uint8Array(a*4);for(let r=0;r<a;++r){const n=t[r],d=2*Math.PI*n/a,l=new B(Math.cos(d),Math.sin(d),0).normalize();i[r*4]=(l.x*.5+.5)*255,i[r*4+1]=(l.y*.5+.5)*255,i[r*4+2]=127,i[r*4+3]=255}const s=new ht(i,e,e);return s.wrapS=xe,s.wrapT=xe,s.needsUpdate=!0,s}function _t(o){const e=Math.floor(o)%2===0?Math.floor(o)+1:Math.floor(o),t=e*e,a=Array(t).fill(0);let i=Math.floor(e/2),s=e-1;for(let r=1;r<=t;){if(i===-1&&s===e?(s=e-2,i=0):(s===e&&(s=0),i<0&&(i=e-1)),a[i*e+s]!==0){s-=2,i++;continue}else a[i*e+s]=r++;s++,i--}return a}const Pe={defines:{SAMPLES:16,SAMPLE_VECTORS:gt(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new F},cameraProjectionMatrixInverse:{value:new ze},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;
		
		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
			vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}
		
		float getDepth(const vec2 uv) {
		#if DEPTH_VALUE_SOURCE == 1    
			return textureLod(tDepth, uv.xy, 0.0).a;
		#else
			return textureLod(tDepth, uv.xy, 0.0).r;
		#endif
		}

		float fetchDepth(const ivec2 uv) {
			#if DEPTH_VALUE_SOURCE == 1    
				return texelFetch(tDepth, uv.xy, 0).a;
			#else
				return texelFetch(tDepth, uv.xy, 0).r;
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);
			
			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;
		
			denoised += w * neighborColor;
			totalWeight += w;
		}
		
		void main() {
			float depth = getDepth(vUv.xy);	
			vec3 viewNormal = getViewNormal(vUv);	
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);
		
			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}
		
			if (totalWeight > 0.) { 
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}`};function gt(o,e,t){const a=$t(o,e,t);let i="vec3[SAMPLES](";for(let s=0;s<o;s++){const r=a[s];i+=`vec3(${r.x}, ${r.y}, ${r.z})${s<o-1?",":")"}`}return i}function $t(o,e,t){const a=[];for(let i=0;i<o;i++){const s=2*Math.PI*e*i/o,r=Math.pow(i/(o-1),t);a.push(new B(Math.cos(s),Math.sin(s),r))}return a}class ea{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}dot(e,t,a){return e[0]*t+e[1]*a}dot3(e,t,a,i){return e[0]*t+e[1]*a+e[2]*i}dot4(e,t,a,i,s){return e[0]*t+e[1]*a+e[2]*i+e[3]*s}noise(e,t){let a,i,s;const r=.5*(Math.sqrt(3)-1),n=(e+t)*r,d=Math.floor(e+n),l=Math.floor(t+n),b=(3-Math.sqrt(3))/6,T=(d+l)*b,y=d-T,c=l-T,S=e-y,m=t-c;let w,u;S>m?(w=1,u=0):(w=0,u=1);const z=S-w+b,E=m-u+b,M=S-1+2*b,P=m-1+2*b,N=d&255,L=l&255,f=this.perm[N+this.perm[L]]%12,v=this.perm[N+w+this.perm[L+u]]%12,h=this.perm[N+1+this.perm[L+1]]%12;let p=.5-S*S-m*m;p<0?a=0:(p*=p,a=p*p*this.dot(this.grad3[f],S,m));let x=.5-z*z-E*E;x<0?i=0:(x*=x,i=x*x*this.dot(this.grad3[v],z,E));let A=.5-M*M-P*P;return A<0?s=0:(A*=A,s=A*A*this.dot(this.grad3[h],M,P)),70*(a+i+s)}noise3d(e,t,a){let i,s,r,n;const l=(e+t+a)*.3333333333333333,b=Math.floor(e+l),T=Math.floor(t+l),y=Math.floor(a+l),c=1/6,S=(b+T+y)*c,m=b-S,w=T-S,u=y-S,z=e-m,E=t-w,M=a-u;let P,N,L,f,v,h;z>=E?E>=M?(P=1,N=0,L=0,f=1,v=1,h=0):z>=M?(P=1,N=0,L=0,f=1,v=0,h=1):(P=0,N=0,L=1,f=1,v=0,h=1):E<M?(P=0,N=0,L=1,f=0,v=1,h=1):z<M?(P=0,N=1,L=0,f=0,v=1,h=1):(P=0,N=1,L=0,f=1,v=1,h=0);const p=z-P+c,x=E-N+c,A=M-L+c,g=z-f+2*c,C=E-v+2*c,D=M-h+2*c,V=z-1+3*c,X=E-1+3*c,R=M-1+3*c,U=b&255,G=T&255,O=y&255,W=this.perm[U+this.perm[G+this.perm[O]]]%12,$=this.perm[U+P+this.perm[G+N+this.perm[O+L]]]%12,ge=this.perm[U+f+this.perm[G+v+this.perm[O+h]]]%12,be=this.perm[U+1+this.perm[G+1+this.perm[O+1]]]%12;let k=.6-z*z-E*E-M*M;k<0?i=0:(k*=k,i=k*k*this.dot3(this.grad3[W],z,E,M));let Y=.6-p*p-x*x-A*A;Y<0?s=0:(Y*=Y,s=Y*Y*this.dot3(this.grad3[$],p,x,A));let q=.6-g*g-C*C-D*D;q<0?r=0:(q*=q,r=q*q*this.dot3(this.grad3[ge],g,C,D));let Z=.6-V*V-X*X-R*R;return Z<0?n=0:(Z*=Z,n=Z*Z*this.dot3(this.grad3[be],V,X,R)),32*(i+s+r+n)}noise4d(e,t,a,i){const s=this.grad4,r=this.simplex,n=this.perm,d=(Math.sqrt(5)-1)/4,l=(5-Math.sqrt(5))/20;let b,T,y,c,S;const m=(e+t+a+i)*d,w=Math.floor(e+m),u=Math.floor(t+m),z=Math.floor(a+m),E=Math.floor(i+m),M=(w+u+z+E)*l,P=w-M,N=u-M,L=z-M,f=E-M,v=e-P,h=t-N,p=a-L,x=i-f,A=v>h?32:0,g=v>p?16:0,C=h>p?8:0,D=v>x?4:0,V=h>x?2:0,X=p>x?1:0,R=A+g+C+D+V+X,U=r[R][0]>=3?1:0,G=r[R][1]>=3?1:0,O=r[R][2]>=3?1:0,W=r[R][3]>=3?1:0,$=r[R][0]>=2?1:0,ge=r[R][1]>=2?1:0,be=r[R][2]>=2?1:0,k=r[R][3]>=2?1:0,Y=r[R][0]>=1?1:0,q=r[R][1]>=1?1:0,Z=r[R][2]>=1?1:0,nt=r[R][3]>=1?1:0,Ce=v-U+l,Ne=h-G+l,Re=p-O+l,Ue=x-W+l,Oe=v-$+2*l,We=h-ge+2*l,Fe=p-be+2*l,Be=x-k+2*l,Ve=v-Y+3*l,je=h-q+3*l,He=p-Z+3*l,Ge=x-nt+3*l,Ie=v-1+4*l,Xe=h-1+4*l,ke=p-1+4*l,Ye=x-1+4*l,se=w&255,ne=u&255,le=z&255,ce=E&255,At=n[se+n[ne+n[le+n[ce]]]]%32,Dt=n[se+U+n[ne+G+n[le+O+n[ce+W]]]]%32,Pt=n[se+$+n[ne+ge+n[le+be+n[ce+k]]]]%32,Et=n[se+Y+n[ne+q+n[le+Z+n[ce+nt]]]]%32,zt=n[se+1+n[ne+1+n[le+1+n[ce+1]]]]%32;let de=.6-v*v-h*h-p*p-x*x;de<0?b=0:(de*=de,b=de*de*this.dot4(s[At],v,h,p,x));let ue=.6-Ce*Ce-Ne*Ne-Re*Re-Ue*Ue;ue<0?T=0:(ue*=ue,T=ue*ue*this.dot4(s[Dt],Ce,Ne,Re,Ue));let fe=.6-Oe*Oe-We*We-Fe*Fe-Be*Be;fe<0?y=0:(fe*=fe,y=fe*fe*this.dot4(s[Pt],Oe,We,Fe,Be));let ve=.6-Ve*Ve-je*je-He*He-Ge*Ge;ve<0?c=0:(ve*=ve,c=ve*ve*this.dot4(s[Et],Ve,je,He,Ge));let he=.6-Ie*Ie-Xe*Xe-ke*ke-Ye*Ye;return he<0?S=0:(he*=he,S=he*he*this.dot4(s[zt],Ie,Xe,ke,Ye)),27*(b+T+y+c+S)}}class H extends mt{constructor(e,t,a,i,s,r,n){super(),this.width=a!==void 0?a:512,this.height=i!==void 0?i:512,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=new Map,this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=Jt(),this.pdNoiseTexture=this.generateNoise(),this.gtaoRenderTarget=new me(this.width,this.height,{type:I}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new J({defines:Object.assign({},Ae.defines),uniforms:Q.clone(Ae.uniforms),vertexShader:Ae.vertexShader,fragmentShader:Ae.fragmentShader,blending:K,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new Ct,this.normalMaterial.blending=K,this.pdMaterial=new J({defines:Object.assign({},Pe.defines),uniforms:Q.clone(Pe.uniforms),vertexShader:Pe.vertexShader,fragmentShader:Pe.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new J({defines:Object.assign({},De.defines),uniforms:Q.clone(De.uniforms),vertexShader:De.vertexShader,fragmentShader:De.fragmentShader,blending:K}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new J({uniforms:Q.clone(qe.uniforms),vertexShader:qe.vertexShader,fragmentShader:qe.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:dt,blendDst:Me,blendEquation:we,blendSrcAlpha:ct,blendDstAlpha:Me,blendEquationAlpha:we}),this.blendMaterial=new J({uniforms:Q.clone(Ke.uniforms),vertexShader:Ke.vertexShader,fragmentShader:Ke.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:Nt,blendSrc:dt,blendDst:Me,blendEquation:we,blendSrcAlpha:ct,blendDstAlpha:Me,blendEquationAlpha:we}),this.fsQuad=new xt(null),this.originalClearColor=new re,this.setGBuffer(s?s.depthTexture:void 0,s?s.normalTexture:void 0),r!==void 0&&this.updateGtaoMaterial(r),n!==void 0&&this.updatePdMaterial(n)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this.fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e!==void 0?(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1):(this.depthTexture=new $e,this.depthTexture.format=Rt,this.depthTexture.type=Ut,this.normalRenderTarget=new me(this.width,this.height,{minFilter:Le,magFilter:Le,type:I,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);const a=this.normalTexture?1:0,i=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=a,this.gtaoMaterial.defines.DEPTH_SWIZZLING=i,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=a,this.pdMaterial.defines.DEPTH_SWIZZLING=i,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&(e.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=e.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=gt(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,t,a){switch(this._renderGBuffer&&(this.overrideVisibility(),this.renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this.restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this.renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case H.OUTPUT.Off:break;case H.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=a.texture,this.copyMaterial.blending=K,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case H.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=K,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case H.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=K,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case H.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:t);break;case H.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=K,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case H.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=a.texture,this.copyMaterial.blending=K,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.renderPass(e,this.blendMaterial,this.renderToScreen?null:t);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}renderPass(e,t,a,i,s){e.getClearColor(this.originalClearColor);const r=e.getClearAlpha(),n=e.autoClear;e.setRenderTarget(a),e.autoClear=!1,i!=null&&(e.setClearColor(i),e.setClearAlpha(s||0),e.clear()),this.fsQuad.material=t,this.fsQuad.render(e),e.autoClear=n,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}renderOverride(e,t,a,i,s){e.getClearColor(this.originalClearColor);const r=e.getClearAlpha(),n=e.autoClear;e.setRenderTarget(a),e.autoClear=!1,i=t.clearColor||i,s=t.clearAlpha||s,i!=null&&(e.setClearColor(i),e.setClearAlpha(s||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=n,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}overrideVisibility(){const e=this.scene,t=this._visibilityCache;e.traverse(function(a){t.set(a,a.visible),(a.isPoints||a.isLine)&&(a.visible=!1)})}restoreVisibility(){const e=this.scene,t=this._visibilityCache;e.traverse(function(a){const i=t.get(a);a.visible=i}),t.clear()}generateNoise(e=64){const t=new ea,a=e*e*4,i=new Uint8Array(a);for(let r=0;r<e;r++)for(let n=0;n<e;n++){const d=r,l=n;i[(r*e+n)*4]=(t.noise(d,l)*.5+.5)*255,i[(r*e+n)*4+1]=(t.noise(d+e,l)*.5+.5)*255,i[(r*e+n)*4+2]=(t.noise(d,l+e)*.5+.5)*255,i[(r*e+n)*4+3]=(t.noise(d+e,l+e)*.5+.5)*255}const s=new ht(i,e,e,Ot,Wt);return s.wrapS=xe,s.wrapT=xe,s.needsUpdate=!0,s}}H.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};const _="./assets/",ta=new Bt,Qe=new Map,at=o=>Zt()==="low"?o.replace(/_(1k|2k)\.(jpg|webp|hdr)$/,"_512.$2"):o;function ae(o,e){o=at(o);const t=o+(e?":s":"");if(Qe.has(t))return Qe.get(t);const a=ta.load(o);return a.wrapS=a.wrapT=xe,a.anisotropy=8,e&&(a.colorSpace=Gt),Qe.set(t,a),a}function aa(o,e=!0){return ae(_+o,e)}function oa(o,{repeat:e=[1,1],color:t=16777215,normalScale:a=1,roughness:i=1,metalness:s=0,res:r="1k"}={}){const n=ae(`${_}tex/${o}_diff_${r}.jpg`,!0).clone(),d=ae(`${_}tex/${o}_nor_gl_${r}.jpg`).clone(),l=ae(`${_}tex/${o}_rough_1k.jpg`).clone();for(const b of[n,d,l])b.repeat.set(e[0],e[1]);return new et({map:n,normalMap:d,roughnessMap:l,roughness:i,metalness:s,color:t,normalScale:new F(a,a)})}function ia(o,{scale:e=.25,color:t=16777215,roughness:a=1,metalness:i=0,normalScale:s=1,low:r=!1,vertexColors:n=!1,emissive:d=null,emissiveIntensity:l=1,envMapIntensity:b=1,key:T=""}={}){const y={color:t,roughness:r?Math.min(1,a*.8):a,metalness:i,vertexColors:n,envMapIntensity:b};if(d!=null&&Object.assign(y,{emissive:d,emissiveIntensity:l}),r)return new et(y);const c=new et(y),S={tTriD:{value:ae(`${_}tex/${o}_diff_1k.jpg`,!0)},tTriR:{value:ae(`${_}tex/${o}_rough_1k.jpg`)},tTriN:{value:ae(`${_}tex/${o}_nor_gl_1k.jpg`)},uTriS:{value:e},uTriNS:{value:s}};return c.userData.tri=S,c.onBeforeCompile=m=>{Object.assign(m.uniforms,S),m.vertexShader=m.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vTriP; varying vec3 vTriN;`).replace("#include <project_vertex>",`#include <project_vertex>
        { vec4 tp = vec4(transformed, 1.0); vec3 tn = objectNormal;
          #ifdef USE_INSTANCING
            tp = instanceMatrix * tp; tn = mat3(instanceMatrix) * tn;
          #endif
          vTriP = (modelMatrix * tp).xyz; vTriN = normalize(mat3(modelMatrix) * tn); }`),m.fragmentShader=m.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vTriP; varying vec3 vTriN; uniform sampler2D tTriD, tTriR, tTriN; uniform float uTriS, uTriNS;
        vec3 triW() { vec3 w = pow(abs(normalize(vTriN)), vec3(6.0)); return w / (w.x + w.y + w.z); }
        vec4 triS(sampler2D t, vec3 w) { vec3 p = vTriP * uTriS; return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }`).replace("#include <map_fragment>",`#include <map_fragment>
        vec3 triw = triW(); diffuseColor.rgb *= triS(tTriD, triw).rgb;`).replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
        roughnessFactor *= triS(tTriR, triw).g;`).replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        { vec3 p = vTriP * uTriS, n = normalize(vTriN);
          vec3 tx = texture2D(tTriN, p.zy).xyz * 2.0 - 1.0, ty = texture2D(tTriN, p.xz).xyz * 2.0 - 1.0, tz = texture2D(tTriN, p.xy).xyz * 2.0 - 1.0;
          // whiteout-style blend of the three tangent-space normals into world space
          vec3 wn = normalize(n + (vec3(0.0, tx.y, tx.x) * triw.x + vec3(ty.x, 0.0, ty.y) * triw.y + vec3(tz.x, tz.y, 0.0) * triw.z) * uTriNS);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`)},c.customProgramCacheKey=()=>"tri"+T,c}const bt={value:0},St={value:0},wt={value:0},ra=`
  varying vec3 vWPos;
  uniform float uWet, uRain, uFxT;
  float dh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float dvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dh21(i), dh21(i + vec2(1.0, 0.0)), f.x), mix(dh21(i + vec2(0.0, 1.0)), dh21(i + vec2(1.0, 1.0)), f.x), f.y); }
  // octaves on rotated lattices: no visible grid of blobs when seen from high up
  float dfbm(vec2 p) { return dvn(p) * 0.5 + dvn(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 17.1) * 0.3 + dvn(mat2(0.28, 0.96, -0.96, 0.28) * p * 4.07 + 3.7) * 0.2; }
`;function sa(o,{antiTile:e=!0,macro:t=.18,macroScale:a=.02,tint:i=null,tintAmt:s=0,wet:r=!1,rough:n=null,key:d="",track:l=null,mow:b=null}={}){const T=new re(i??16777215);return o.userData.wetPatch=r,o.onBeforeCompile=y=>{y.uniforms.uWet=bt,y.uniforms.uRain=St,y.uniforms.uFxT=wt,y.vertexShader=y.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vWPos;`+(l?`
attribute vec3 aTrk; varying vec3 vTrk;`:"")).replace("#include <project_vertex>",`#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`+(l?`
vTrk = aTrk;`:""));const c=w=>w.toFixed(4);let S=y.fragmentShader.replace("#include <common>",`#include <common>
`+ra+(l?`
varying vec3 vTrk;`:""));S=S.replace("#include <map_fragment>",`
      float pud = 0.0;
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        ${e?`vec4 s2 = texture2D(map, vec2(vMapUv.y, -vMapUv.x) * 0.43 + 0.37);
        sampledDiffuseColor = mix(sampledDiffuseColor, s2, smoothstep(0.3, 0.7, dfbm(vWPos.xz * 0.035 + 5.0)));`:""}
        diffuseColor *= sampledDiffuseColor;
      #endif
      float mN = dfbm(vWPos.xz * ${c(a)});
      diffuseColor.rgb *= 1.0 + (mN - 0.5) * ${c(t*2)};
      ${s?`diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(${c(T.r)}, ${c(T.g)}, ${c(T.b)}), smoothstep(0.45, 0.75, dfbm(vWPos.xz * ${c(a*.6)} + 31.0)) * ${c(s)});`:""}
      float rub = 0.0, wetL = uWet;
      ${l&&l.ruts?`#ifdef USE_MAP
      {
        // loose-surface stage: two compacted wheel ruts along the driving line (darker, smoother;
        // icy on snow), loose gravel ridges between them and along the edges, scattered stones
        float lat = vTrk.x, along = vMapUv.y * ${c(l.uScale)};
        float dl = lat - vTrk.y + 0.25 * sin(along * 0.031) * (1.0 - vTrk.z);
        float rr = abs(abs(dl) - 0.85 - 0.06 * sin(along * 0.11));
        rub = (1.0 - smoothstep(0.16, 0.52, rr)) * (0.7 + 0.3 * dvn(vec2(lat * 5.0, along * 0.12)));
        diffuseColor.rgb *= 1.0 - ${l.snow?"0.1":"0.26"} * rub;
        ${l.snow?"diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 0.95), rub * 0.8);":""}
        float ridge = (1.0 - smoothstep(0.0, 0.35, abs(dl))) * 0.6 + smoothstep(${c(l.halfW-1.5)}, ${c(l.halfW-.1)}, abs(lat));
        float stone = step(0.7, dh21(floor(vWPos.xz * 14.0))) * (0.4 + 0.6 * dvn(vWPos.xz * 3.0));
        diffuseColor.rgb *= 1.0 + ridge * (0.1 + 0.22 * stone) - 0.08 * stone * (1.0 - rub);
        // the corners get swept clean towards the outside: wider, darker driven area
        diffuseColor.rgb *= 1.0 - 0.08 * vTrk.z * (1.0 - smoothstep(1.5, 2.6, abs(dl)));
        wetL = uWet * (0.7 + 0.6 * rub);
      }
      #endif`:l?`#ifdef USE_MAP
      {
        float lat = vTrk.x, along = vMapUv.y * ${c(l.uScale)};
        float dl = abs(lat - vTrk.y);
        // rubbered racing line: two dark tyre bands that merge, streaky along the track
        float streak = dvn(vec2(lat * 3.1, along * 0.04)) * 0.6 + dvn(vWPos.xz * 0.35) * 0.4;
        rub = (1.0 - smoothstep(0.5, 2.3, dl)) * (0.7 + 0.3 * streak);
        diffuseColor.rgb *= 1.0 - 0.34 * rub;
        // marbles: rubber pick-up granules just off the line in corners
        float mb = smoothstep(2.4, 3.4, dl) * (1.0 - smoothstep(4.6, 6.4, dl)) * vTrk.z;
        float gran = step(0.72, dh21(floor(vWPos.xz * 26.0))) * (0.5 + 0.5 * dvn(vWPos.xz * 1.7));
        diffuseColor.rgb *= 1.0 - mb * (0.12 + 0.55 * gran);
        // unused edges: dustier, lighter, slightly warmer
        float edge = smoothstep(${c(l.halfW-2.6)}, ${c(l.halfW-.2)}, abs(lat)) * (0.6 + 0.4 * dvn(vWPos.xz * 0.6));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.12, 1.04), edge * 0.6);
        // repair patches (fresh darker or old faded asphalt) with tar-sealed seams
        vec2 pc = vec2(along / 17.0, (lat + ${c(l.halfW)}) / 4.4);
        vec2 ci = floor(pc), cf = fract(pc);
        float ph = dh21(ci + 7.3);
        if (ph > 0.9) {
          vec2 lo = vec2(dh21(ci + 1.1), dh21(ci + 2.7)) * 0.3, hi = 1.0 - vec2(dh21(ci + 3.9), dh21(ci + 5.2)) * 0.3;
          float inP = step(lo.x, cf.x) * step(cf.x, hi.x) * step(lo.y, cf.y) * step(cf.y, hi.y);
          vec2 dd = min(cf - lo, hi - cf) * vec2(17.0, 4.4);
          float seam = inP * (1.0 - smoothstep(0.02, 0.08, min(dd.x, dd.y)));
          diffuseColor.rgb *= mix(1.0, ph > 0.95 ? 0.8 : 1.12, inP) * (1.0 - 0.55 * seam);
        }
        // crack sealing lines (thin dark meandering tar)
        float ck = abs(dvn(vec2(along * 0.09, lat * 0.35) + 40.0) - 0.5);
        diffuseColor.rgb *= 1.0 - 0.2 * (1.0 - smoothstep(0.003, 0.009, ck)) * step(0.72, dvn(vec2(along * 0.02, 3.0)));
        // the racing line dries first: tyres clear the water off it, so once the rain eases a
        // dark-grey dry line opens along the rubber while the rest of the track stays wet
        float dryK = clamp(1.0 - uRain / max(uWet, 0.02), 0.0, 1.0);
        float dl2 = 1.0 - smoothstep(1.0, 2.6 + 0.8 * streak, dl);
        wetL = uWet * (1.0 - max(0.5 * rub * smoothstep(0.9, 0.35, uWet), dl2 * dryK * (0.97 - 0.2 * streak)));
        // standing water collects in the low edges, spray-darkened stripes along the wheel tracks
        wetL = min(1.0, wetL * (1.0 + 0.25 * smoothstep(${c(l.halfW-2)}, ${c(l.halfW)}, abs(lat))));
      }
      #endif`:""}
      ${b?`#ifdef USE_MAP
      {
        float along = vMapUv.y * ${c(b.uScale)};
        float band = step(0.5, fract(along / 9.0 + 0.04 * sin(along * 0.05)));
        diffuseColor.rgb *= mix(0.9, 1.08, band);
        float clump = dfbm(vWPos.xz * 1.3 + 7.0), fine = dvn(vWPos.xz * 6.0);
        diffuseColor.rgb *= 0.82 + 0.26 * clump + 0.08 * (fine - 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.02, 0.7), smoothstep(0.62, 0.8, dfbm(vWPos.xz * 0.08 + 3.0)) * 0.5);
      }
      #endif`:""}
      ${r?`pud = smoothstep(0.5, 0.66, dfbm(vWPos.xz * 0.11 + 11.0)) * smoothstep(0.25, 0.8, wetL)${l?` * (0.45 + 0.9 * smoothstep(${c(l.halfW-3.5)}, ${c(l.halfW)}, abs(vTrk.x)))`:""};
      diffuseColor.rgb *= 1.0 - 0.38 * wetL - 0.2 * pud;`:""}
    `);const m=(n?`
roughnessFactor = ${c(n[0])} + ${c(n[1]-n[0])} * roughnessFactor;`:"")+(l&&l.ruts?`
roughnessFactor *= 1.0 - ${l.snow?"0.55":"0.25"} * rub;`:"")+(r?`
roughnessFactor *= 1.0 - 0.12 * rub; roughnessFactor = mix(roughnessFactor, 0.16, wetL * 0.75); roughnessFactor = mix(roughnessFactor, 0.03, pud);`:"");m&&(S=S.replace("#include <roughnessmap_fragment>","#include <roughnessmap_fragment>"+m)),r&&(S=S.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        normal = normalize(mix(normal, normalize(vNormal) * faceDirection, max(pud, wetL * 0.5)));
        // raindrop ripples: expanding rings, one drop per 35 cm cell at a random time, on the
        // water film and (stronger) in the puddles; fade out with distance (they would only alias)
        if (uRain > 0.02) {
          float rd = length(vWPos - cameraPosition);
          float rk = uRain * max(pud, wetL * 0.45) * (1.0 - smoothstep(12.0, 45.0, rd));
          if (rk > 0.002) {
            vec2 rg = vec2(0.0);
            for (int li = 0; li < 2; li++) {
              vec2 cp = vWPos.xz * (li == 0 ? 2.9 : 2.1) + float(li) * 17.3;
              vec2 ci = floor(cp), cf = fract(cp) - 0.5;
              float h = dh21(ci), t = fract(uFxT * (0.9 + 0.5 * h) + h * 7.0);
              vec2 dd = cf - (vec2(dh21(ci + 3.1), dh21(ci + 5.7)) - 0.5) * 0.5;
              float r = length(dd), w = r - t * 0.45;
              float ring = sin(w * 60.0) * exp(-w * w * 180.0) * (1.0 - t) * step(h, 0.35 + 0.6 * uRain);
              rg += dd / max(r, 1e-3) * ring;
            }
            normal = normalize(normal + (viewMatrix * vec4(rg.x, 0.0, rg.y, 0.0)).xyz * rk * 0.35);
          }
        }`)),y.fragmentShader=S},o.customProgramCacheKey=()=>`detail|${e}|${t}|${a}|${s}|${T.getHex()}|${r}|${n}|${d}|${l?l.halfW+","+l.uScale+","+!!l.ruts+!!l.snow:""}|${b?b.uScale:""}`,o}{const o=Vt;o.fog_vertex.includes("vFogRay")||(o.fog_pars_vertex=o.fog_pars_vertex.replace("varying float vFogDepth;",`varying float vFogDepth;
#ifdef FOG_EXP2
varying vec3 vFogRay;
#endif`),o.fog_vertex=o.fog_vertex.replace("vFogDepth = - mvPosition.z;",`vFogDepth = - mvPosition.z;
#ifdef FOG_EXP2
vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`),o.fog_pars_fragment=o.fog_pars_fragment.replace("uniform float fogDensity;",`uniform float fogDensity;
varying vec3 vFogRay;`),o.fog_fragment=o.fog_fragment.replace("float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );",`
      float fogFactor;
      if (fogDensity < 0.0) {
        // density(y) = a * (0.3 + 0.7 * exp(-y / 260)): integrate along the ray camera -> fragment
        float fd = length(vFogRay), y0 = max(cameraPosition.y, 0.0), dy = (cameraPosition.y + vFogRay.y) - cameraPosition.y;
        float b = 1.0 / 260.0, e0 = exp(-y0 * b);
        float avg = abs(dy * b) < 1e-3 ? e0 : e0 * (1.0 - exp(-dy * b)) / (dy * b);
        float tau = -fogDensity * fd * (0.3 + 0.7 * clamp(avg, 0.0, 1.5));
        fogFactor = 1.0 - exp(-tau * tau);
      } else fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );`))}class ot extends Ht{constructor(e,t=25e-5){super(e,t),this.isHeightFog=!0}get density(){return-Math.abs(this._d??0)}set density(e){this._d=Math.abs(e)}clone(){return new ot(this.color,Math.abs(this.density))}}const ee=new B,Je=new B,oe=new B,na=new B(0,1,0);function la(o,e,t,a,i=400){const s=o.shadow.camera;s.right!==a&&(s.left=-a,s.right=a,s.top=a,s.bottom=-a,s.updateProjectionMatrix()),oe.copy(t).normalize(),ee.crossVectors(na,oe),ee.lengthSq()<1e-6&&ee.set(1,0,0),ee.normalize(),Je.crossVectors(oe,ee);const r=2*a/o.shadow.mapSize.x,n=Math.round(e.dot(ee)/r)*r,d=Math.round(e.dot(Je)/r)*r,l=e.dot(oe);o.target.position.set(0,0,0).addScaledVector(ee,n).addScaledVector(Je,d).addScaledVector(oe,l),o.position.copy(o.target.position).addScaledVector(oe,i)}const ca={day:"kloofendal_48d_partly_cloudy_puresky_1k.hdr",afternoon:"qwantani_late_afternoon_puresky_1k.hdr",dusk:"qwantani_dusk_2_puresky_1k.hdr",night:"moonless_golf_1k.hdr",overcast:"kloofendal_overcast_puresky_1k.hdr"},pe={};function da(o){const{data:e,width:t,height:a}=o.image;if(!e||!(e instanceof Float32Array))return null;let i=-1,s=0;for(let y=0;y<a/2;y++)for(let c=0;c<t;c++){const S=(y*t+c)*4,m=e[S]*.2126+e[S+1]*.7152+e[S+2]*.0722;m>i&&(i=m,s=y*t+c)}const r=s%t,n=Math.floor(s/t),d=(r+.5)/t,b=(1-(n+.5)/a-.5)*Math.PI,T=(d-.5)*2*Math.PI;return new B(Math.cos(T)*Math.cos(b),Math.sin(b),Math.sin(T)*Math.cos(b)).normalize()}function ua(o){const{data:e,width:t,height:a}=o.image;if(!e||!(e instanceof Float32Array))return null;const i=[0,0,0];let s=0;for(let r=Math.floor(a*.42);r<a*.49;r++)for(let n=0;n<t;n+=2){const d=(r*t+n)*4;i[0]+=Math.min(4,e[d]),i[1]+=Math.min(4,e[d+1]),i[2]+=Math.min(4,e[d+2]),s++}return new re().setRGB(i[0]/s,i[1]/s,i[2]/s,vt)}function fa(o="day"){return pe[o]?.userData.sun||null}function va(o="day"){return pe[o]?.userData.horizon||null}function ha(o,e,t="day",{background:a=!0,intensity:i=1}={}){return new Promise(s=>{const r=n=>{if(!n)return s(!1);e.environment=n,e.environmentIntensity=i,a&&(e.background=n,e.backgroundIntensity=t==="night"?.35:1,e.backgroundBlurriness=0),s(!0)};if(pe[t])return r(pe[t]);new Kt().setDataType(ie).load(at(_+"hdri/"+ca[t]),n=>{n.mapping=jt;try{const d=n.image.data;if(d instanceof Float32Array){let l=!1;for(let b=0;b<d.length;b++)d[b]>2e4&&(d[b]=2e4,l=!0);l&&(n.needsUpdate=!0)}}catch{}if(t==="night")try{const{data:d,width:l,height:b}=n.image;if(d instanceof Float32Array){for(let T=0;T<b;T++){const y=.5-(T+.5)/b,c=Math.min(1,Math.max(0,y/.4)),S=.1+.9*(c*c*(3-2*c))**1.5;for(let m=0;m<l;m++){const w=(T*l+m)*4,u=d[w],z=d[w+1],E=d[w+2],M=u*.2126+z*.7152+E*.0722,P=Math.min(1,.3+.7*c),N=Math.min(M,.6)*S;d[w]=(u*P+M*(1-P)*.55)*S*.8,d[w+1]=(z*P+M*(1-P)*.75)*S*.9,d[w+2]=(E*P+M*(1-P)*1.25)*S+N*.05;const L=.012+.3*c*c,f=d[w]*.2126+d[w+1]*.7152+d[w+2]*.0722;if(f>L){const v=(L+(f-L)/(1+(f-L)*8))/f;d[w]*=v,d[w+1]*=v,d[w+2]*=v}}}n.needsUpdate=!0}}catch{}try{n.userData.sun=da(n),n.userData.horizon=ua(n)}catch{n.userData.sun=null}pe[t]=n,r(n)},void 0,()=>r(null))})}const pa={uniforms:{tDiffuse:{value:null},tDepth:{value:null},uTexel:{value:new F(1/1280,1/720)},uFocus:{value:10},uRange:{value:4},uMax:{value:6},uLogF:{value:Math.log2(6001)},uNear:{value:0}},vertexShader:"varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`uniform sampler2D tDiffuse, tDepth; uniform vec2 uTexel; uniform float uFocus, uRange, uMax, uLogF, uNear; varying vec2 vUv;
    float linZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return exp2(d * uLogF) - 1.0; }
    float coc(float z) { float c = (z - uFocus) / uRange; return clamp(c > 0.0 ? c * 0.5 : -c * uNear, 0.0, 1.0); }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float z = linZ(vUv), c = coc(z);
      vec3 acc = base.rgb; float wsum = 1.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 24.0), a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r * uMax * uTexel;
        vec2 suv = vUv + o * max(c, 0.0);
        float sz = linZ(suv), sc = coc(sz);
        float w = sz < z - 0.5 ? sc : 1.0;
        w *= step(r * 0.98, max(c, sc) + 0.02);
        acc += texture2D(tDiffuse, suv).rgb * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`},ut={uniforms:{tDiffuse:{value:null},uCon:{value:1.08},uSat:{value:1.08},uVig:{value:.32},uWarm:{value:.035}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uCon, uSat, uVig, uWarm; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec3 s = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);
      c.rgb = mix(c.rgb, s, uCon - 1.0);
      c.rgb += uWarm * vec3(1.0, 0.35, -0.6) * smoothstep(0.45, 1.0, l) + uWarm * vec3(-0.4, 0.0, 0.5) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5; d.x *= 1.25;
      c.rgb *= mix(1.0, smoothstep(0.95, 0.25, length(d)), uVig);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`},Mt={uniforms:{tDiffuse:{value:null},uAmt:{value:0},uBlur:{value:0},uTime:{value:0},uWind:{value:0},uAspect:{value:16/9},uSeed:{value:0},uTexel:{value:new F(1/1280,1/720)}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uAmt, uBlur, uTime, uWind, uAspect, uSeed; uniform vec2 uTexel; varying vec2 vUv;
    float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
    void layer(vec2 uv, float sc, float seed, float dens, inout vec2 off, inout float m, inout float rim, inout float spec) {
      vec2 p = vec2(uv.x * uAspect, uv.y) * sc;
      // the airflow pushes the drops out towards the edges and up at speed; slow: they run down
      vec2 flow = vec2((uv.x - 0.5) * 1.6, 0.6) * uWind - vec2(0.0, 0.08) * (1.0 - uWind);
      vec2 ci = floor(p), cf = fract(p);
      float h = h21(ci + seed + uSeed);
      if (h > uAmt * dens) return;
      float h2 = h21(ci + seed + uSeed + 3.7), h3 = h21(ci + seed + uSeed + 9.1);
      float life = fract(uTime * (0.1 + 0.18 * h2 + 0.5 * uWind) + h3);
      float a = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.55 - 0.3 * uWind, 1.0, life));
      vec2 c = vec2(0.25 + 0.5 * h2, 0.25 + 0.5 * h3) + flow * life * 0.9;
      vec2 d = cf - c;
      vec2 dir = normalize(flow + vec2(1e-4));
      float along = dot(d, dir), across = dot(d, vec2(-dir.y, dir.x));
      float st = 1.0 + 2.5 * uWind * smoothstep(0.1, 0.5, life);
      float r = 0.1 + 0.16 * h;
      float dist = length(vec2(along / st, across));
      float inD = (1.0 - smoothstep(r * 0.8, r, dist)) * a;
      if (inD <= 0.001) return;
      off += -d / r * (r / sc) * vec2(1.0 / uAspect, 1.0) * 1.6 * inD;
      m = max(m, inD);
      rim = max(rim, smoothstep(0.55, 0.95, dist / r) * inD);
      spec = max(spec, smoothstep(0.35, 0.0, length(d / r - vec2(-0.3, 0.35))) * inD);
    }
    void main() {
      vec2 off = vec2(0.0); float m = 0.0, rim = 0.0, spec = 0.0;
      if (uAmt > 0.001) {
      layer(vUv, 9.0, 1.3, 0.3, off, m, rim, spec);
      layer(vUv, 17.0, 7.9, 0.2, off, m, rim, spec);
      layer(vUv, 31.0, 4.2, 0.12, off, m, rim, spec);
      }
      vec4 base = texture2D(tDiffuse, vUv);
      // speed: radial blur towards the edges of the frame (the centre stays sharp)
      if (uBlur > 0.001) {
        vec2 dv = vUv - 0.5; float e = smoothstep(0.12, 0.7, length(dv * vec2(uAspect, 1.0)));
        vec3 acc = base.rgb;
        for (int i = 1; i < 7; i++) acc += texture2D(tDiffuse, vUv - dv * (float(i) * 0.012 * uBlur * e)).rgb;
        base.rgb = acc / 7.0;
      }
      // wet glass: a soft veil
      vec3 veil = (texture2D(tDiffuse, vUv + uTexel * vec2(2.0, 1.0)).rgb + texture2D(tDiffuse, vUv - uTexel * vec2(2.0, 1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 2.0)).rgb + texture2D(tDiffuse, vUv - uTexel * vec2(-1.0, 2.0)).rgb) * 0.25;
      vec3 col = mix(base.rgb, veil, 0.3 * uAmt);
      if (m > 0.0) {
        vec3 rc = texture2D(tDiffuse, clamp(vUv + off, 0.001, 0.999)).rgb * 1.08 + 0.02;
        col = mix(col, rc, m);
        col *= 1.0 - 0.35 * rim;
        col += spec * 0.18;
      }
      gl_FragColor = vec4(col, base.a);
    }`};function ma(o){if(!o||o.lensRain)return o?.lensRain||null;const e=new te(Mt);e.enabled=!1,e.setSize=(a,i)=>e.uniforms.uTexel.value.set(1/Math.max(1,a),1/Math.max(1,i));const t=o.grade?o.passes.indexOf(o.grade)+1:o.passes.length;return o.insertPass(e,t),o.lensRain=e,e}const xa={uniforms:{tDiffuse:{value:null},tPrev:{value:null},uMix:{value:0}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:"uniform sampler2D tDiffuse, tPrev; uniform float uMix; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 p = texture2D(tPrev, vUv).rgb; gl_FragColor = vec4(mix(c.rgb, p, uMix), c.a); }"};function ga(o){if(!o||o.xfade)return o?.xfade||null;const e=new te(xa);return e.enabled=!1,o.addPass(e),o.xfade=e,e}const it={naturale:{label:"Naturale",desc:"Resa fedele, nessun filtro"},vivido:{label:"Vivido",desc:"Colori più vivaci e contrasto locale",sat:1.04,vib:.4,con:1.05,local:.22},cinematico:{label:"Cinematico",desc:"Toni ottanio-arancio, vignettatura e grana pellicola",sat:.9,con:1.1,teal:.6,lift:.025,vig:.42,grain:.035,tint:[1,.99,.97]},retro:{label:"Retrò",desc:"Look dei racing game anni 2000: bagliore caldo, colori saturi, foschia",sat:1.28,vib:.15,con:.97,bloom:[2.2,.72,.85],haze:.07,hazeCol:[.98,.9,.78],tint:[1.05,1,.9],vig:.12},contrasto:{label:"Alto contrasto",desc:"Massima leggibilità: chiarezza, contrasto e nitidezza",sat:1.06,con:1.12,local:.35,sharp:.45}},Tt={off:"Disattivata",deuter:"Deuteranopia",protan:"Protanopia",tritan:"Tritanopia"},ba={protan:[.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],deuter:[.367322,.860646,-.227968,.280085,.672501,.047413,-.01182,.04294,.968881],tritan:[1.255528,-.076749,-.178779,-.078411,.930809,.147602,.004733,.691367,.3039]};function rt(o){const e=ba[o];if(!e)return null;const t=o==="tritan"?[0,0,.7,0,0,.7,0,0,0]:[0,0,0,.7,0,0,.7,0,0],a=[1-e[0],-e[1],-e[2],-e[3],1-e[4],-e[5],-e[6],-e[7],1-e[8]],i=[1,0,0,0,1,0,0,0,1];for(let s=0;s<3;s++)for(let r=0;r<3;r++){let n=0;for(let d=0;d<3;d++)n+=t[s*3+d]*a[d*3+r];i[s*3+r]+=n}return i}const Sa={uniforms:{tDiffuse:{value:null},uTexel:{value:new F(1/1280,1/720)},uTime:{value:0},pSat:{value:1},pVib:{value:0},pCon:{value:1},pLocal:{value:0},pTeal:{value:0},pHaze:{value:0},pHazeCol:{value:new re(1,1,1)},pLift:{value:0},pTint:{value:new B(1,1,1)},pVig:{value:0},pGrain:{value:0},pSharp:{value:0},uCB:{value:new Ft},uCBOn:{value:0}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uTime;
    uniform float pSat, pVib, pCon, pLocal, pTeal, pHaze, pLift, pVig, pGrain, pSharp, uCBOn;
    uniform vec3 pHazeCol, pTint; uniform mat3 uCB;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 tap(vec2 o) { return texture2D(tDiffuse, vUv + o * uTexel).rgb; }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      // contrast-adaptive sharpening (after AMD FidelityFX CAS)
      if (pSharp > 0.0) {
        vec3 a = tap(vec2(0.0, -1.0)), b = tap(vec2(-1.0, 0.0)), d = tap(vec2(1.0, 0.0)), e = tap(vec2(0.0, 1.0));
        vec3 mn = min(c, min(min(a, b), min(d, e))), mx = max(c, max(max(a, b), max(d, e)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
        vec3 w = -amp * 0.2 * clamp(pSharp, 0.0, 1.0);
        c = clamp((c + (a + b + d + e) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
      }
      float l = luma(c);
      // clarity: local contrast on luminance against a two-ring neighbourhood average
      if (pLocal > 0.0) {
        float lb = 0.0;
        for (int i = 0; i < 8; i++) {
          float an = float(i) * 0.7853982;
          vec2 o = vec2(cos(an), sin(an));
          lb += luma(tap(o * 4.0)) + luma(tap(vec2(o.y - o.x, o.x + o.y) * 6.5));
        }
        lb *= 0.0625;
        float det = clamp(l - lb, -0.15, 0.15) * pLocal * 6.4 * l * (1.0 - l);
        c *= (l + det) / max(l, 1e-3);
        l = luma(c);
      }
      // contrast (S-curve around mid grey; < 1 flattens)
      c = clamp(c, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), clamp((pCon - 1.0) * 2.5, -1.0, 1.0));
      l = luma(c);
      // saturation + vibrance (boosts muted colours more than already saturated ones)
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, pSat * (1.0 + pVib * (1.0 - sat)));
      // teal shadows / orange highlights
      if (pTeal > 0.0) c = mix(c, c * mix(vec3(0.84, 1.0, 1.12), vec3(1.1, 1.0, 0.86), smoothstep(0.12, 0.72, l)), pTeal);
      c *= pTint;
      c = mix(c, pHazeCol, pHaze * (1.0 - 0.5 * l));
      c = c * (1.0 - pLift) + pLift;
      if (uCBOn > 0.5) { vec3 lin = pow(max(c, 0.0), vec3(2.2)); lin = uCB * lin; c = pow(max(lin, 0.0), vec3(1.0 / 2.2)); }
      if (pVig > 0.0) { vec2 dv = vUv - 0.5; dv.x *= 1.3; c *= mix(1.0, smoothstep(0.9, 0.22, length(dv)), pVig); }
      if (pGrain > 0.0) {
        vec2 px = floor(vUv / uTexel);
        float n = hash(px + fract(uTime * 7.31) * 913.0) + hash(px * 1.37 + fract(uTime * 3.17) * 411.0) - 1.0;
        c += n * pGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`};function st(){const o=qt();return{filter:it[o.gfxFilter]?o.gfxFilter:"naturale",sharpen:!!o.gfxSharpen,grain:!!o.gfxGrain,vignette:o.gfxVignette!==!1,colorblind:Tt[o.gfxColorblind]?o.gfxColorblind:"off"}}const ft={naturale:"",vivido:"saturate(1.2) contrast(1.05)",cinematico:"contrast(1.08) saturate(0.88) sepia(0.1)",retro:"saturate(1.32) sepia(0.14) brightness(1.04) contrast(0.95)",contrasto:"contrast(1.18) saturate(1.06)"};function wa(o){const e="apex-cb-"+o;if(typeof document>"u"||document.getElementById(e))return e;const t=rt(o),a=[0,1,2].map(s=>`${t[s*3]} ${t[s*3+1]} ${t[s*3+2]} 0 0`).join(" ")+" 0 0 0 1 0",i=document.createElementNS("http://www.w3.org/2000/svg","svg");return i.setAttribute("width","0"),i.setAttribute("height","0"),i.setAttribute("aria-hidden","true"),i.style.position="absolute",i.style.pointerEvents="none",i.innerHTML=`<filter id="${e}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${a}"/></filter>`,document.body.appendChild(i),e}function yt(o=st()){const e=[];return ft[o.filter]&&e.push(ft[o.filter]),o.colorblind!=="off"&&e.push(`url(#${wa(o.colorblind)})`),e.join(" ")}const Ee=new Set;function Ma(o,e){const t=it[e.filter]||{},a=o.filter.uniforms;a.pSat.value=t.sat??1,a.pVib.value=t.vib??0,a.pCon.value=t.con??1,a.pLocal.value=t.local??0,a.pTeal.value=t.teal??0,a.pHaze.value=t.haze??0,a.pLift.value=t.lift??0,a.pHazeCol.value.setRGB(...t.hazeCol||[1,1,1]),a.pTint.value.set(...t.tint||[1,1,1]),a.pVig.value=e.vignette?t.vig??0:0,a.pGrain.value=(t.grain??0)+(e.grain?.04:0),a.pSharp.value=Math.min(1,(t.sharp??0)+(e.sharpen?.5:0));const i=rt(e.colorblind);a.uCBOn.value=i?1:0,i&&a.uCB.value.set(...i),o.grade&&(o.grade.uniforms.uVig.value=e.vignette?o.grade.userData?.vig??.32:0),o.filter.enabled=e.filter!=="naturale"||e.sharpen||e.grain||e.colorblind!=="off";const s=o.bloom,r=s?.userData;if(r?.strength!=null){const[n,d,l]=t.bloom||[1,r.threshold,r.radius];s.strength=r.strength*n,s.threshold=d,s.radius=l}}function tt(o){const e=st(),t=a=>{a.filter?.uniforms?Ma(a,e):a.style&&(a.style.filter=yt(e))};if(o){[...Ee].some(a=>a.deref()===o)||Ee.add(new WeakRef(o)),t(o);return}for(const a of[...Ee]){const i=a.deref();i?t(i):Ee.delete(a)}}const Ta={uniforms:{tDiffuse:{value:null},uSun:{value:new F(.5,1.4)},uAmt:{value:0},uAspect:{value:16/9},uTint:{value:new re(1,.93,.8)}},vertexShader:`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt;
    varying vec2 vUv; varying float vVis;
    void main() {
      vUv = uv;
      float vis = 0.0;
      bool on = uSun.x > 0.0 && uSun.x < 1.0 && uSun.y > 0.0 && uSun.y < 1.0;
      if (uAmt > 0.0 && on) {
        for (int i = 0; i < 9; i++) {
          vec2 o = vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0) * 0.006;
          vec3 c = texture2D(tDiffuse, uSun + o).rgb;
          vis += smoothstep(0.82, 0.97, dot(c, vec3(0.2126, 0.7152, 0.0722)));
        }
        vis /= 9.0;
      } else if (uAmt > 0.0) vis = 0.35;
      vVis = vis * uAmt;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAspect; uniform vec3 uTint;
    varying vec2 vUv; varying float vVis;
    float disc(vec2 p, vec2 c, float r, float soft) { vec2 d = p - c; d.x *= uAspect; return 1.0 - smoothstep(r * (1.0 - soft), r, length(d)); }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (vVis > 0.001) {
        vec2 d = vUv - uSun; d.x *= uAspect; float r = length(d);
        float edge = smoothstep(1.6, 0.0, length(uSun - 0.5) * 2.0);
        vec3 add = uTint * (exp(-r * 9.0) * 0.12 + exp(-r * 2.5) * 0.035) * edge;
        add += uTint * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.4) * 0.07 * edge;   // anamorphic streak
        bool on = uSun.x > 0.0 && uSun.x < 1.0 && uSun.y > 0.0 && uSun.y < 1.0;
        if (on) {
          vec2 axis = vec2(0.5) - uSun;
          add += vec3(0.55, 0.75, 1.0) * disc(vUv, uSun + axis * 1.35, 0.035, 0.7) * 0.05;
          add += vec3(1.0, 0.6, 0.35) * disc(vUv, uSun + axis * 1.75, 0.07, 0.5) * 0.035;
          add += vec3(0.6, 1.0, 0.7) * disc(vUv, uSun + axis * 0.65, 0.022, 0.6) * 0.05;
          vec2 rp = vUv - (uSun + axis * 2.2); rp.x *= uAspect; float rr = length(rp);
          add += vec3(0.7, 0.8, 1.0) * smoothstep(0.02, 0.0, abs(rr - 0.16)) * 0.025;   // faint halo ring
        }
        col.rgb += add * vVis * (1.0 - 0.6 * dot(col.rgb, vec3(0.333)));
      }
      gl_FragColor = col;
    }`},ya={uniforms:{tDiffuse:{value:null},uSun:{value:new F(.5,.5)},uAmt:{value:0},uTint:{value:new re(1,.85,.62)},uAspect:{value:16/9}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt, uAspect; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 dl = (uSun - vUv); float len = length(dl * vec2(uAspect, 1.0));
      vec2 stepv = dl * (0.92 / 24.0);
      vec2 p = vUv; float acc = 0.0, w = 1.0;
      float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      p += stepv * j;
      for (int i = 0; i < 24; i++) {
        vec3 s = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb;
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        acc += smoothstep(0.8, 1.0, l) * w; w *= 0.95; p += stepv;
      }
      acc /= 24.0;
      float fall = exp(-len * 2.2);
      col.rgb += uTint * acc * fall * uAmt * (1.0 - 0.5 * dot(col.rgb, vec3(0.333)));
      gl_FragColor = col;
    }`};function Aa(o,e,t,a=1){const i=o?.rays;if(!i)return;if(!t||a<=.001){i.enabled=!1;return}j.copy(t).normalize();const s=j.dot(e.getWorldDirection(new B));j.multiplyScalar(1e3).add(e.position).project(e);const r=j.x*.5+.5,n=j.y*.5+.5,d=a*pt.smoothstep(s,.15,.6);i.enabled=d>.01&&j.z<1&&r>-.6&&r<1.6&&n>-.6&&n<1.6,i.uniforms.uSun.value.set(r,n),i.uniforms.uAmt.value=d,i.uniforms.uAspect.value=e.aspect}const j=new B;function Da(o,e,t,a=1){const i=o?.flare;if(!i)return;if(!t||a<=.001){i.enabled=!1;return}j.copy(t).normalize();const s=j.dot(e.getWorldDirection(new B));j.multiplyScalar(1e3).add(e.position).project(e);const r=j.x*.5+.5,n=j.y*.5+.5,d=a*pt.smoothstep(s,.2,.75);i.enabled=d>.01&&j.z<1&&r>-.5&&r<1.5&&n>-.5&&n<1.5,i.uniforms.uSun.value.set(r,n),i.uniforms.uAmt.value=d,i.uniforms.uAspect.value=e.aspect}function Pa(o,e){try{for(const t of e?.passes||[])t.dispose?.();e?.dispose?.()}catch{}try{o?.dispose(),o?.forceContextLoss()}catch{}}function Ea(o,e,t,{bloom:a=.22,low:i=!1,ao:s=!1,grade:r=!0,filter:n=!0,flare:d=!1,rays:l=!1,dof:b=!1}={}){if(i)return n&&tt(o.domElement),null;try{const T=o.getSize(new F),y=new me(T.x*o.getPixelRatio(),T.y*o.getPixelRatio(),{type:I,depthBuffer:!0,samples:0});y.depthTexture=new $e(T.x,T.y,ie);const c=new It(o,y);b&&(c.renderTarget2.depthTexture=new $e(y.width,y.height,ie));const S=new Xt(e,t);c.addPass(S);const m=o.getSize(new F);if(b){const u=new te(pa);u.enabled=!1;const z=u.render.bind(u);u.render=(E,M,P,...N)=>{u.uniforms.tDepth.value=P.depthTexture,u.uniforms.uLogF.value=Math.log2(t.far+1),z(E,M,P,...N)},u.setSize=(E,M)=>u.uniforms.uTexel.value.set(1/Math.max(1,E),1/Math.max(1,M)),c.addPass(u),c.dof=u}if(s)try{const u=new H(e,t,m.x,m.y);u.updateGtaoMaterial({radius:1.6,distanceExponent:1.6,thickness:2,scale:1,samples:12}),u.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:12}),u.blendIntensity=.85,c.addPass(u),c.ao=u}catch(u){console.warn("AO off",u)}const w=new kt(new F(m.x,m.y),a,.55,.88);if(c.addPass(w),c.addPass(new Yt),l){const u=new te(ya);u.enabled=!1,c.addPass(u),c.rays=u}if(d){const u=new te(Ta);u.enabled=!1,c.addPass(u),c.flare=u}if(r){const u=new te(ut);u.userData={vig:ut.uniforms.uVig.value},c.addPass(u),c.grade=u}if(c.addPass(new Qt(m.x*o.getPixelRatio(),m.y*o.getPixelRatio())),c.bloom=w,w.userData={strength:w.strength,threshold:w.threshold,radius:w.radius},n){const u=new te(Sa),z=o.getPixelRatio();u.uniforms.uTexel.value.set(1/Math.max(1,m.x*z),1/Math.max(1,m.y*z)),u.setSize=(M,P)=>u.uniforms.uTexel.value.set(1/Math.max(1,M),1/Math.max(1,P));const E=u.render.bind(u);u.render=(...M)=>{u.uniforms.uTime.value=performance.now()/1e3%1e3,E(...M)},c.addPass(u),c.filter=u,tt(c)}return c}catch(T){return console.warn("postprocessing off",T),null}}const Na=Object.freeze(Object.defineProperty({__proto__:null,COLORBLIND_MODES:Tt,FILTER_PRESETS:it,FXT:wt,HeightFog:ot,LensRainShader:Mt,RAIN:St,WET:bt,addLensRain:ma,addXFade:ga,applyFilterSettings:tt,applyHDRI:ha,colorblindMatrix:rt,detailPatch:sa,filterCSS:yt,filterSettings:st,hdriHorizon:va,hdriSun:fa,loadTex:aa,lowRes:at,makeComposer:Ea,pbr:oa,releaseGL:Pa,stabilizeShadow:la,triMat:ia,updateGodRays:Aa,updateSunFlare:Da},Symbol.toStringTag,{value:"Module"}));export{Tt as C,it as F,ot as H,St as R,bt as W,tt as a,ha as b,va as c,sa as d,ma as e,ga as f,Da as g,fa as h,wt as i,Kt as j,Na as k,aa as l,Ea as m,oa as p,Pa as r,la as s,ia as t,Aa as u};
