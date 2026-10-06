// Build-only skyline envelopes. No native code is shipped to the browser.
#include <algorithm>
#include <cmath>
#include <cstdint>
static constexpr double PI=3.14159265358979323846;
static double degrees(double a){return a*180/PI;}
static int wrap(int k,int bins){return (k%bins+bins)%bins;}
extern "C" void building_profiles(int sites_count,int objects_count,const double* sites,const double* objects,
 double cell_radius,double step,double range,double observer,std::uint16_t* exact,std::uint16_t* estimated,
 std::uint16_t* upper,std::uint8_t* flags){
 const int bins=static_cast<int>(std::lround(360/step));
 for(int i=0;i<sites_count;i++){
  const double x=sites[i*2],y=sites[i*2+1];
  for(int j=0;j<objects_count;j++){
   const double* o=objects+j*8;
   double dx=o[0]-x,dy=o[1]-y,d=std::hypot(dx,dy),r=o[2]+cell_radius;
   const int quality=static_cast<int>(o[7]);
   if(quality==3){if(d<=r)for(int k=0;k<bins;k++)flags[i*bins+k]|=4;continue;}
   if(d-r>range)continue;
   double direction=degrees(std::atan2(dx,dy));if(direction<0)direction+=360;
   const double width=degrees(std::asin(std::min(1.0,r/std::max(d,1e-9))));
   const int first=d<=r?0:static_cast<int>(std::floor((direction-width)/step));
   const int last=d<=r?bins-1:static_cast<int>(std::floor((direction+width)/step));
   const std::uint16_t high=static_cast<std::uint16_t>(std::ceil(degrees(std::atan2(std::max(0.0,o[6]-observer),std::max(.01,d-r)))*10));
   for(int a=first;a<=last;a++){
    const int k=i*bins+wrap(a,bins);
    if(quality==0){flags[k]|=1;continue;}
    upper[k]=std::max(upper[k],high);if(quality==2)flags[k]|=2;
   }
   if(quality==0)continue;
   dx=o[3]-x;dy=o[4]-y;d=std::hypot(dx,dy);r=o[5]-cell_radius;
   if(r<=0||d<=r||d+r>range)continue;
   direction=degrees(std::atan2(dx,dy));if(direction<0)direction+=360;
   const double inner_width=degrees(std::asin(std::min(1.0,r/std::max(d,1e-9))));
   const int low_first=static_cast<int>(std::floor((direction-inner_width)/step))+1;
   const int low_last=static_cast<int>(std::ceil((direction+inner_width)/step))-2;
   const std::uint16_t low=static_cast<std::uint16_t>(std::floor(degrees(std::atan2(std::max(0.0,o[6]-observer),d+r))*10));
   auto* target=quality==2?estimated:exact;
   for(int a=low_first;a<=low_last;a++){
    const int k=i*bins+wrap(a,bins);target[k]=std::max(target[k],low);
   }
  }
 }
}
