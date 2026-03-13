import ArrowBottom from '@icon/ArrowBottom';
import useStore from '@store/store';

const CollapseOptions = () => {
  const setHideMenuOptions = useStore((state) => state.setHideMenuOptions);
  const hideMenuOptions = useStore((state) => state.hideMenuOptions);

  return (
    <div
      className='flex cursor-pointer justify-center rounded-md px-3 text-gray-600 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-500/10 dark:hover:text-white'
      onClick={() => setHideMenuOptions(!hideMenuOptions)}
    >
      <ArrowBottom
        className={`h-3 w-3 transition-all duration-100 ${
          hideMenuOptions ? 'rotate-180' : ''
        }`}
      />
    </div>
  );
};

export default CollapseOptions;
