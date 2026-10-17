import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceEdgeScore,detailedSurface} from '../providers/pragmatic/visual-surface.js';

const picture=(w,h,paint)=>{
 const data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const [r,g,b]=paint(x,y),p=(y*w+x)*4;
  data[p]=r;data[p+1]=g;data[p+2]=b;data[p+3]=255;
 }
 return {data,width:w,height:h};
};

test('dark logo splash has low detail despite an otherwise stable runtime',()=>{
 const image=picture(120,200,(x,y)=>[20,28,40]);
 assert.equal(surfaceEdgeScore(image),0);
 assert.equal(detailedSurface(surfaceEdgeScore(image)),false);
});

test('uniform gradient loading screen has low spatial detail',()=>{
 const img=picture(128,240,(x,y)=>[12+Math.floor(y/18),21+Math.floor(y/22),43+Math.floor(y/16)]);
 assert.equal(detailedSurface(surfaceEdgeScore(img)),false);
});

test('textured game reels clear conservative visual gate',()=>{
 const img=picture(128,240,(x,y)=>((x+y)%9<4?[220,25,15]:[20,170,220]));
 assert.equal(detailedSurface(surfaceEdgeScore(img)),true);
});

test('non-finite and missing image data block screenshots',()=>{
 assert.equal(surfaceEdgeScore({data:null,width:100,height:100}),0);
 assert.equal(detailedSurface(NaN),false);
});
