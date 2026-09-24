// Host-build mark. `vite build --mode crazygames` replaces this module
// with an empty component so the logo, alt text, and styles are not emitted.
import alteruSvg from './img/alteru.svg';
import './AlteruWatermark.less';

export function AlteruWatermark() {
  return <img className="ln__watermark" src={alteruSvg} alt="AlterU" />;
}
