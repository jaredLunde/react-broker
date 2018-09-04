import App from '../App'
import createRenderer from '../../webpack/createRenderer'


export default ({clientStats}) => createRenderer({clientStats, App})
