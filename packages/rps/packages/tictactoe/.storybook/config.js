import {
  configure
} from '@storybook/react';

function loadStories() {
  require('../src/__stories__');
  // You can require as many stories as you need.
}
configure(loadStories, module);