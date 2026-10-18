/** Spatial detail distinguishes the uniform loading splash from painted reels.
 * A low score blocks interaction; a high score is NOT final occlusion proof.
 */
export function surfaceEdgeScore({data,width,height},step=4){
 if(!data||!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16) return 0;
 let sum=0,n=0;
 for(let y=step;y<height;y+=step)for(let x=step;x<width;x+=step){
  const i=(y*width+x)*4,j=i-step*4;
  for(let c=0;c<3;c++){sum+=Math.abs(data[i+c]-data[j+c]);n++;}
 }
 return n?sum/n:0;
}
export function detailedSurface(score,threshold=5){
 return Number.isFinite(score)&&score>=threshold;
}
