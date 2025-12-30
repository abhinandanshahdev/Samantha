declare module 'react-window-infinite-loader' {
  import { Component, ReactNode } from 'react';

  export interface InfiniteLoaderProps {
    isItemLoaded: (index: number) => boolean;
    itemCount: number;
    loadMoreItems: (startIndex: number, stopIndex: number) => Promise<void> | void;
    threshold?: number;
    minimumBatchSize?: number;
    children: (props: {
      onItemsRendered: (props: {
        overscanStartIndex: number;
        overscanStopIndex: number;
        visibleStartIndex: number;
        visibleStopIndex: number;
      }) => void;
      ref: (ref: any) => void;
    }) => ReactNode;
  }

  export default class InfiniteLoader extends Component<InfiniteLoaderProps> {
    resetloadMoreItemsCache(): void;
  }
}