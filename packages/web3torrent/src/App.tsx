import ConnectionBanner from '@rimble/connection-banner';
import React, {useState, useEffect} from 'react';
import {Route, Switch, BrowserRouter} from 'react-router-dom';
import './App.scss';
import {LayoutFooter, LayoutHeader} from './components/layout';
import Welcome from './pages/welcome/Welcome';

import File from './pages/file/File';
import Upload from './pages/upload/Upload';
import {RoutePath} from './routes';
import {requiredNetwork} from './constants';
import {Budgets} from './pages/budgets/Budgets';
import {web3torrent} from './clients/web3torrent-client';

const App: React.FC = () => {
  const [currentNetwork, setCurrentNetwork] = useState(
    window.ethereum ? Number(window.ethereum.networkVersion) : undefined
  );

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    web3torrent.paymentChannelClient.initialize().then(() => setInitialized(true));
  }, [initialized]);

  useEffect(() => {
    if (window.ethereum) {
      const listener = chainId => setCurrentNetwork(Number(chainId));
      window.ethereum.on('networkChanged', listener);
      return () => {
        window.ethereum.removeListener('networkChanged', listener);
      };
    }
    return () => ({});
  }, []);

  const ready = currentNetwork === requiredNetwork && initialized;

  return (
    <BrowserRouter>
      <main>
        <ConnectionBanner
          currentNetwork={currentNetwork}
          requiredNetwork={requiredNetwork}
          onWeb3Fallback={!('ethereum' in window)}
        />
        <Route path={RoutePath.Root}>
          <LayoutHeader />
        </Route>
        <Switch>
          <Route exact path={RoutePath.Root}>
            <Welcome ready={ready} />
          </Route>
          <Route exact path={RoutePath.FileWithInfoHash}>
            <File ready={ready} />
          </Route>
          } />
          <Route exact path={RoutePath.Upload}>
            <Upload ready={ready} />
          </Route>
          <Route exact path={RoutePath.Budgets}>
            <Budgets ready={ready} />
          </Route>
          />
        </Switch>
      </main>
      <Route path={RoutePath.Root} component={LayoutFooter} />
    </BrowserRouter>
  );
};

export default App;
